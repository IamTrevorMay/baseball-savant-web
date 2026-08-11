---
title: Lineage & Impact Analysis — Knowing What Breaks Before You Break It
domain: data-reliability
tags:
  - lineage
  - impact-analysis
  - blast-radius
  - openlineage
  - column-level-lineage
  - schema-change
  - dependency-graph
  - sql-parsing
sources_reviewed: 22
last_updated: 2026-08-11
---

# Lineage & Impact Analysis — Knowing What Breaks Before You Break It

## TL;DR

- **Lineage answers two questions, and they are the two an incident forces on you.** *Downstream:* "I'm about to change this — what stops working?" *Upstream:* "this number is wrong — which ancestor is the liar?" The rest of the category is packaging. (documented)
- **Table-level lineage says five things are connected; column-level says which two depend on the column you're touching.** "What depends on `pitches`?" answers *everything* — a restatement of the architecture, not an answer. (documented)
- **Triton's real graph does not match the graph in anyone's head.** Read off the source: `pitcher_season_command`/`pitcher_season_deception` are **not** downstream of `stuff_plus`; `league_percentiles` is **not** downstream of `league_averages` (siblings from identical sources); `pitch_baselines` closes a cycle — `pitches` → `pitch_baselines` → `pitches.stuff_plus`. (measured, 2026-08-11)
- **`stuff_plus` fans out to ~35 leaf consumers and exactly two aggregates** (`mv_pitcher_season_stats`, `mv_pitcher_pitch_stats`; `scripts/create-materialized-views.sql:104,322,374`). The 2026 outage was therefore **wide but shallow** — many wrong renders, zero corrupted intermediates, no restatement cascade. Only the map tells you that. (measured)
- **The detector for that outage has been materialized nightly, unqueried, all season.** `mv_pitcher_season_stats.stuff_plus_n` counts non-null `stuff_plus` per pitcher-season; `SUM(stuff_plus_n)/SUM(pitches)` is the number that went 99.5% → 0%. (measured)
- **Postgres already stores column-level lineage for every view and matview, free.** `pg_depend.refobjsubid` carries the column number; views depend on tables indirectly via their `pg_rewrite` rule. Triton uses none of it. (documented)
- **SQL parsing is the standard repo-side derivation, and it is lossy exactly where Triton lives.** `SELECT *` needs schema introspection; dynamic SQL is largely out of reach — and `/api/chat` runs **model-authored SQL**, which no parser will ever resolve. (documented)
- **OpenLineage is the right standard and Marquez the right server, and Triton should adopt neither.** The spec assumes an orchestrator emitting `RunEvent`s. Triton's is `vercel.json` plus one `system_metadata` row; no producer exists for Next.js route handlers. (documented + inferred)
- **"No monitor exists" is wrong — but right in spirit.** `/api/cron/integrity` runs eight checks nightly, all existence or referential shape, none coverage of a derived column. `checkPitchBaselines` passed every night of the outage, correctly. Right instrument, wrong node. (measured — supersedes a line in `Jo/context/triton-context.md`)
- **The edge nobody draws is the cache.** `CACHE_TAG_REGISTRY` (`lib/queryCache.ts:58`) maps `pitches` → `trends:`, `mvpct:`, `player:`, `scene:`. A correct upstream repair that misses a prefix is still a wrong number on screen. (measured)

---

## 1. The two traversals

| Traversal | Trigger | Output you need |
|---|---|---|
| **Downstream (impact analysis)** | about to change something | tables, jobs, routes, caches, screens to check |
| **Upstream (root cause)** | a number is wrong | ordered candidate ancestors, nearest-first |

DataHub names both as its product's use cases: "proactively identify the impact of breaking schema changes," and "rapidly discover which upstream dependencies may have caused unexpected data quality issues." Neither works without the thing lineage tools don't supply: **an assertion at each node.** Lineage narrows the search space; freshness/volume/coverage monitors (`02-data-freshness-slos.md`, `03-volume-completeness-monitoring.md`) find the culprit inside it. **Lineage without monitors is a map with no "you are here."**

---

## 2. Table-level vs column-level

| | Table-level | Column-level |
|---|---|---|
| Node / edge | table; "B reads A" | `table.column`; "B.y derives from A.x" |
| Derived from | catalogs, orchestrator DAGs | SQL parsing w/ schema, or engine runtime capture |
| Cost | hours | weeks, or a vendor |

Borrow OpenLineage's `columnLineage` vocabulary even if you never emit an event: **`DIRECT`** (derived from the input — `IDENTITY`, `TRANSFORMATION`, `AGGREGATION`), **`INDIRECT`** (*impacted* without being derived — `JOIN`, `GROUP_BY`, `FILTER`, `SORT`, `WINDOW`, `CONDITIONAL`), plus a `masking` boolean. The split is load-bearing: break `pitches.stuff_plus` and consumers show **wrong values**; break `pitches.game_date` and every windowed consumer shows **wrong rows**. Same table, different blast radius, different remediation.

---

## 3. Where lineage actually comes from

### 3.1 System catalogs — free, current, narrow

```sql
-- Every view/matview depending on one specific column of one specific table.
SELECT DISTINCT dep.relname AS dependent_object, dep.relkind
FROM pg_depend d
JOIN pg_rewrite   r   ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
JOIN pg_class     dep ON dep.oid = r.ev_class
JOIN pg_class     src ON src.oid = d.refobjid
JOIN pg_attribute a   ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
WHERE src.relname = 'pitches' AND a.attname = 'stuff_plus'
  AND d.refobjsubid > 0 AND dep.oid <> src.oid;
```

`deptype`: `n` normal (drop needs `CASCADE`), `a` auto, `i` internal (a view's own `ON SELECT` rule), `e` extension member.

**Limit:** in-database objects only. It finds `mv_batter_season_stats`; it will never find `app/api/player-data/route.ts`. Most Triton consumers are TypeScript assembling SQL strings, so this covers a minority of the graph — run it before any `ALTER TABLE` regardless.

### 3.2 Declared / orchestrator-native — cheap if you already have it

dbt's `ref()`/`source()` and Dagster's software-defined assets make the graph a byproduct of writing the transformation, so it cannot drift. dbt adds `exposures` for the last mile, making impact analysis a CLI selector — `dbt ls --select raw_payments+ --resource-type exposure`, or `state:modified+` in CI to enumerate a PR's blast radius. Triton has neither; see `05-orchestration-scheduling.md`.

### 3.3 SQL parsing — medium cost, lossy in Triton's exact style

`sqlglot.lineage` traces an output column back through CTEs, subqueries, set operations, and joins, returning a DAG of `Node` objects; DataHub's parser is built on it. Its documented failure modes are all Triton's:

- **`SELECT *` cannot be expanded without schema introspection** — `sqllineage` emits `foo.* <- quux.*`. `lib/hooks/usePlayerData.ts:132` does `select('*')` on `player_summary`.
- **Dynamic SQL is largely out of reach.** `lib/reportQueryBuilder.ts:159` interpolates `${config.table}` plus a caller-chosen metric list; `/api/scene-stats` branches across ~15 SQL shapes; `/api/chat` executes **model-authored arbitrary SQL** through `run_query` (`app/api/chat/route.ts:353`).
- Good parsers attach a **confidence score** to unresolved queries. If Triton ever builds this, do the same.

### 3.4 Runtime capture — highest fidelity, engine-bound, unavailable here

Unity Catalog intercepts Spark plans for automatic column-level lineage in all languages — but not for path-referenced sources, RDDs, global temp views, or checkpointed datasets, and nothing before 2024-09-01. Snowflake exposes `ACCESS_HISTORY` (`DIRECT_OBJECTS_ACCESSED`, `BASE_OBJECTS_ACCESSED`, `OBJECTS_MODIFIED` with source→target column maps; one-year retention) plus `OBJECT_DEPENDENCIES`. Dataplex covers BigQuery/Dataflow/Dataproc automatically, but with **30 minutes to 24 hours** of propagation latency — useless for the incident response you wanted it for.

**Triton equivalent: none.** Postgres has no `ACCESS_HISTORY`; `pg_stat_statements` gives text and counts, not lineage. *(inferred)*

---

## 4. The tooling landscape, honestly

| Thing | What it is | Fit |
|---|---|---|
| **OpenLineage** | A spec: `Job`, `Run`, `Dataset`; `RunEvent`/`JobEvent`/`DatasetEvent`; facets (`sql`, `schema`, `columnLineage`, `parent`, `errorMessage`). Not a product. | Vocabulary yes, emission no |
| **Marquez** | OpenLineage's reference server — Postgres-backed graph, REST API, UI; community Airflow/Spark/dbt/Dagster integrations | A service to visualize 40 nodes. No |
| **DataHub** | Catalog with table + column lineage; Impact Analysis tab (degree filtering, CSV export); GraphQL | Real capability, real ops burden. Revisit at 10× |
| **dbt** | Lineage as byproduct of `ref()`; exposures; `state:modified+` | Most tempting; needs a transformation-layer rewrite |
| **Warehouse-native** | Free-ish, automatic, engine-bound | N/A — Supabase Postgres has no equivalent |

Why lineage programs fail is consistent in the literature: not bad tooling, but that "the lineage graph is disconnected from the daily workflows where teams actually make decisions," and adoption dies when "lineage feels like overhead rather than a tool that helps daily work." Mid-market SaaS lands in the low five figures annually, enterprise suites in six; open source trades license cost for operational overhead and suits "teams with strong internal data platform staff." Triton is one person.

The counter-argument is equally documented: **manual lineage rots** — "anything that requires manual maintenance will drift," with divergence "within weeks." Jo's read: rot is a function of *distance from the code*, not manualness. A markdown file edited in the same commit as the schema change — the discipline `docs/VARIABLES.md` already enforces — is a different artifact from a quarterly wiki page. §9 adds a CI grep.

---

## 5. The Triton lineage map

From source, 2026-08-11: `vercel.json`, `app/api/cron/*`, `app/api/update/route.ts`, `scripts/create-materialized-views.sql`, `scripts/create-refresh-league-{averages,percentiles}.sql`, `lib/queryCache.ts`. *(verify)* = unconfirmed against the running database.

### 5.1 The chain

```
Savant (Statcast) ──09:00 /api/cron/pitches──► pitches   8.89M rows, 90+ cols, 29 idx
   syncPitches(T-3 … T), per game_type S|R|P      │
MLB Stats API ────09:30 player-stats───► player_season_stats
Savant bat-track/video ─09:10 (in refresh)─► bat_tracking_swing_miss, pitch_videos

pitches
  │ control edge: system_metadata['pitches_last_run'] = {date,year,gameTypes,totalInserted}
  │               written cron/pitches:54 → read cron/refresh:34
  ├─► refresh_player_summary() / refresh_batter_summary()   (inline, only if inserted>0;
  │      → player_summary (MV), batter_summary (MV)          update/route.ts:182)
  │
  ▼ 09:10 /api/cron/refresh
  ├─(1) refreshPitchBaselines(year)                          update/route.ts:241
  │       pitches ──AGGREGATION──► pitch_baselines
  │       (pitch_name × game_year: avg/std velo, movement, extension)
  │
  ├─(2) applyStuffPlusForDateRange()   ⚠ runs in cron/pitches, NOT refresh
  │       pitch_baselines ⨝ pitches ──DIRECT/TRANSFORMATION──► pitches.stuff_plus
  │       ONE UPDATE PER DAY (~4k rows, ~1.4s)               update/route.ts:306
  │       ↑ FEEDBACK CYCLE: pitches → pitch_baselines → pitches.stuff_plus
  │
  ├─(3) POST /api/compute-triton    → pitcher_season_command
  │     POST /api/compute-deception → pitcher_season_deception
  │       BOTH read raw `pitches` geometry only. NEITHER reads stuff_plus.
  │                              compute-triton:48, compute-deception:29
  │
  ├─(4) refresh_league_averages(season)    ┐ SIBLINGS, not parent/child. Both read
  │     refresh_league_percentiles(season) ┤ pitches, milb_pitches, pitcher_season_command,
  │                                        │ pitcher_season_deception.
  │                                        └ `_plus` EXCLUDED → stuff_plus in NEITHER.
  │
  ├─(5) refresh_materialized_views()
  │       mv_pitcher_season_stats  (a TABLE, not an MV; DELETE+INSERT, year ≥ Y-1)
  │           └─ avg_stuff_plus + stuff_plus_n   ◄── the coverage detector
  │       mv_batter_season_stats; mv_team_{pitching,batting,bullpen,platoon}_stats
  │       mv_pitcher_pitch_stats (avg_stuff_plus; NO app consumer found)
  │       → system_metadata['mv_last_refreshed']
  │
  └─(6) invalidateBySource('pitches') → trends:, mvpct:, player:, scene:
        league_averages → league:, pctile:                   queryCache.ts:58

WEEKLY /api/cron/sos-weekly (Sun 11:00) → sos_scores
DAILY  /api/cron/integrity  (10:00)     → integrity_checks (8 checks — §5.4)
```

### 5.2 Consumer fan-out

| Consumer | Reads | Entry point |
|---|---|---|
| Pitching dashboard | `player_summary`, `sos_scores`, `pitches` (70 cols incl. `stuff_plus`), `players`, `models` | `lib/hooks/usePlayerData.ts:132` → `api/player-data/route.ts:44` |
| ↳ Overview / PitchLevel / Percentile tabs | `pitcher_season_deception` | `OverviewTab.tsx:93`, `PitchLevelTab.tsx:36`, `PercentileTab.tsx:69` |
| ↳ Percentile rings | `league_percentiles` | `api/league-percentiles/route.ts:15` |
| ↳ Location heatmaps | `league_averages` | `lib/useLeagueBaseline.ts:40` → `api/league-baseline/route.ts:63` |
| Reports Builder | `pitches` (dynamic SQL), `league_averages`, `report_templates` | `api/report/route.ts:11`, `lib/reportQueryBuilder.ts:159`, `TileViz.tsx:121` |
| `/api/scene-stats` (broadcast + producer) | `mv_team_*`, `mv_pitcher_season_stats`, `mv_batter_season_stats`, `pitcher_season_command`, `pitcher_season_deception`, `player_season_stats`, `pitches`, `briefs` | `scene-stats/route.ts:83,109,867,929,1203,1592,1609` |
| `/api/standings` | **nothing** — pure MLB Stats API passthrough | `standings/route.ts:47` |
| Trends page | `pitches.stuff_plus` via `trends:` cache | `api/trends/route.ts:47` |
| Newsletter — briefs (14:00) | `pitches` (incl. `stuff_plus`), `players`, `daily_cards` → `briefs` | `cron/briefs/route.ts:946,981,1049,1387` |
| Newsletter — daily-cards (10:00) | `pitches`, `pitcher_season_deception`, `report_card_templates` → `daily_cards` | `cron/daily-cards`, `api/starter-card/route.ts:60,115` |
| Newsletter — send (15:00) | `briefs`, `newsletter_subscribers` → `newsletter_sends` | `cron/newsletter/route.ts:42,58` |
| Daily graphics (12:30) | `report_card_templates`, `pitches`, **latest** `briefs` row → `daily_graphics` | `cron/daily-graphics/route.ts:327,346` |
| AI analyst | **model-authored SQL** over `pitches`, `player_summary`, `lahman_*` | `api/chat/route.ts:353` |
| MCP server / Data Console | `ALLOWED_TABLES` whitelist, 20 tables | `api/explore/query/route.ts:13` |

### 5.3 What the map corrects

1. **`stuff_plus` is leaf-ward, not spine.** Two matviews aggregate it; command and deception never touch it; the league tables exclude `_plus` by design. The 2026 outage corrupted **no intermediate table** — wide, shallow, no restatement cascade. Materially better than it felt, and knowable only from the map.
2. **`pitch_baselines` closes a cycle on `pitches`.** Table-level lineage draws a loop and gives up; column-level resolves it — `pitches.{pitch_name, release_speed, pfx_x, pfx_z, release_extension, game_year}` → `pitch_baselines.*` → `pitches.stuff_plus`, read and write columns disjoint. But **ordering is load-bearing and the steps live in different crons**, 10 minutes apart in the *wrong* order: scoring at 09:00 uses baselines written at 09:10 the previous day. Correct enough for a season-long aggregate — write it down so nobody "fixes" it into a same-run dependency. *(measured from schedule + code; runtime effect inferred)*
3. **`daily_graphics` reads `briefs` by recency, not by date.** Graphics run 12:30 UTC, briefs 14:00 UTC, and the generator takes `ORDER BY date DESC LIMIT 1` (`daily-graphics/route.ts:329,352`). The graphic for day D carries the brief from D−1; if briefs fails two nights, it republishes stale highlights with no visible change. Lineage-derived, not observed. *(verify)*
4. **The cache is an edge.** Any repair rewriting `pitches` must be followed by `invalidateBySource('pitches')`. `CACHE_TAG_REGISTRY` has **no entry** for `pitcher_season_command`, `pitcher_season_deception`, or the `mv_*` family — so a command/deception recompute leaves `scene:` caches serving pre-refresh values until TTL. *(measured; TTL unverified)*

### 5.4 What already exists

`/api/cron/integrity` runs eight checks via `Promise.allSettled` into `integrity_checks`: `unknown_players`, `orphaned_pitchers`, `orphaned_batters`, `new_pitch_names`, `season_constants`, `materialized_views`, `league_averages` (existence-only, self-remediating), `pitch_baselines` (flags `pitch_count < 5 OR std_velo = 0`). Every one tests **existence or referential shape; none tests coverage of a derived column.** `checkLeagueAverages` passes on `COUNT(*) > 0`; `checkPitchBaselines` passed every night of the Stuff+ outage, correctly, because the baselines were fine. The suite is aimed at the wrong node in the graph.

---

## 6. Blast-radius analysis before a change

Fifteen minutes, no tooling.

1. **Name the exact node** — `pitches.stuff_plus`, not "the pitches table." Table granularity is useless here (§2).
2. **In-database dependents** — the `pg_depend` query in §3.1. Catches objects nobody remembers, e.g. `mv_pitcher_pitch_stats`.
3. **In-repo dependents** — `rg -n '\bstuff_plus\b' --type ts --type sql`. Crude, and it is what produced §5.2. Search `lib/` and `scripts/` too, and search the *label* as well as the key — `lib/metricRegistry.ts` binds on both.
4. **Dynamic-SQL dependents** — what grep misses: `lib/reportQueryBuilder.ts`, `lib/reportMetrics.ts` (`METRICS`), `lib/sql.ts` (`TRITON_COLUMNS`), `api/explore/query/route.ts` (`ALLOWED_TABLES`).
5. **Cache prefixes** — `lib/queryCache.ts:58`.
6. **Contract surfaces** — `docs/VARIABLES.md` (same-commit convention), `mcp-server/src/server.ts` tool schemas, and the analyst's **prompt-embedded schema** at `app/api/chat/route.ts:98-155`. That last is a real lineage edge: the model writes SQL against a hardcoded column list in a string. Drop a column and the analyst emits queries that error at runtime.
7. **Classify each edge DIRECT or INDIRECT** (§2) — wrong values vs wrong rows.
8. **Write the radius into the commit** before touching anything. If it is longer than expected, that is the finding.

**Worked example — replace `pitches.stuff_plus` with a new model.** Step 2 → 2 in-database objects (`mv_pitcher_season_stats` is a *table* rebuilt by `DELETE`+`INSERT`, so the column must exist at refresh time). Step 3 → ~35 files. Step 4 → `lib/reportMetrics.ts`, `lib/filterFieldSchemas.ts:286`. Step 5 → 4 cache prefixes. Step 6 → `docs/VARIABLES.md` + the analyst prompt. **Total: 2 DB objects, ~35 files, 4 cache prefixes, 3 contract surfaces, 0 external consumers.** Reversible if the new column lands *alongside* rather than in place — see `06-failure-modes-taxonomy.md` on additive-first schema change.

---

## 7. Downstream impact when an upstream node breaks

Discipline: **walk the map and assert at every node — never assume propagation.** The 2026 Stuff+ outage replayed through §5.1:

| Node | Broke? | Why / why not | How you'd know |
|---|---|---|---|
| Savant fetch | No | row counts perfect all season (Apr 117,333 → Jul 109,421) | volume monitor |
| `pitches` rows | No | upsert succeeded nightly | `trackCronRun` counts |
| `pitch_baselines` | No | refreshed in `cron/refresh`, unaffected by the scoring timeout | `checkPitchBaselines` passed — **and that pass was misread as proof the chain was healthy** |
| `pitches.stuff_plus` | **Yes** | one 12k-row `UPDATE` crossed the 8s `authenticator` cap | `stuff_plus_n / pitches` — never queried |
| `pitcher_season_command` | No | reads raw geometry, not `stuff_plus` | map |
| `pitcher_season_deception` | No | same | map |
| `league_averages` / `league_percentiles` | No | `_plus` excluded by design | `create-refresh-league-averages.sql:10` |
| `mv_pitcher_season_stats` | **Yes, silently** | `avg_stuff_plus` over a shrinking non-null subset; `stuff_plus_n` collapsed | the very column that would have caught it |
| Leaf renders (dashboard, trends, briefs, cards) | **Yes** | `AVG()` skips NULLs → displayed league average drifted only ~0.8 across a total collapse | nothing |

The lesson the map teaches that the incident alone did not: **`pitch_baselines` passing was the misleading signal.** Jo's first root cause was "the baseline refresh starves the scoring UPDATE," and it was wrong. The map shows at a glance that `pitch_baselines` and `pitches.stuff_plus` are *sibling outputs of different steps* — the health of one says nothing about the other. That is the strongest argument for writing the map down. Traversal protocol: `07-incident-response-forensics.md`.

**Late-arriving data is a lineage problem too.** Savant delivers pitches whose `game_date` falls outside the requested window, so `syncPitches` computes the scoring range from `min/max` of the *ingested* dates, not the request window (`app/api/update/route.ts:189-193`). A derived column's window is defined by its parent data, not by the job's parameters. Any future derived column must do the same or it will strand rows. See `02-data-freshness-slos.md`.

---

## 8. The honest cost/benefit at this scale

~14 database objects in the derived chain, ~8 crons, ~40 consumer routes/components, 3 external sources. **The whole graph fits on one page — §5.1 is that page.**

What a tool buys over §5.1: automatic freshness against drift (real value); column precision through dynamic SQL (**not delivered** — §3.3); an impact-analysis UI (replaced by `rg` at this size); cross-team notification (there is no other team). What it costs: a metadata service plus its own Postgres, or self-hosted DataHub, or five figures a year — plus bespoke emitters, since no OpenLineage producer exists for Next.js route handlers, which then need maintaining themselves. On a platform whose largest open reliability gap is that **`reportError` has a `TODO` where the Sentry sink belongs** (`lib/observability.ts:33`), a lineage server would be a category error.

Break-even conditions Jo would act on: a second engineer who doesn't carry the graph in their head; the derived chain exceeding ~25 database objects; a dbt/Dagster migration happening anyway; or an external consumer with an SLA. **None hold today.**

---

## 9. What Triton should do, in order

1. **Ship `Jo/context/triton-lineage.md` as the canonical map**, seeded from §5.1–§5.2, and extend the same-commit rule that governs `docs/VARIABLES.md` to cover it. Distance from code is what kills manual lineage (§4).
2. **Query the detector that already exists.** Nightly:
   `SELECT SUM(stuff_plus_n)::float / NULLIF(SUM(pitches),0) FROM mv_pitcher_season_stats WHERE game_year = EXTRACT(YEAR FROM CURRENT_DATE)::int;` — alert below 0.95. One small-table query; the column has been materialized all season. **Highest-leverage item in this document.**
3. **Add a `derived_columns` registry table** — one row per `(table, column, producing_job, producing_file, coverage_floor)`. Seed with `pitches.stuff_plus`, `pitcher_season_command.*_plus`, `pitcher_season_deception.deception_score`. Have `/api/cron/integrity` iterate it and assert coverage. That turns §5 from a document into an executable graph with no new dependencies.
4. **Extend `CACHE_TAG_REGISTRY`** (`lib/queryCache.ts:58`) to `pitcher_season_command`, `pitcher_season_deception`, and the `mv_*` family, and call `invalidateBySource` for each from `/api/cron/refresh`.
5. **Add a CI grep that fails the build when the map goes stale** — assert every table in `ALLOWED_TABLES` (`api/explore/query/route.ts:13`) appears in the lineage doc and vice versa. Ten lines; the cheapest anti-rot mechanism available.
6. **Run the §3.1 `pg_depend` query into the map once**, and re-run it before any `ALTER TABLE` on `pitches`, `players`, or `pitcher_season_*`.
7. **Fix the `daily_graphics` → `briefs` recency read** (§5.3.3): key the fetch to the graphic's own date, or record the source brief's date in `daily_graphics.metadata` so staleness is visible rather than silent.
8. **Use DIRECT/INDIRECT in incident notes and in the registry.** It makes blast-radius statements precise, and it is free.

**Anti-recommendation — do not stand up Marquez, DataHub, OpenMetadata, or a SaaS lineage vendor.** Not now, and not as a "we'll grow into it" bet. The graph fits on one page; the parts a tool would automate (dynamic SQL, LLM-authored SQL) are exactly the parts no parser resolves; and the integration would be hand-written because no OpenLineage producer exists for Next.js route handlers. You would maintain a lineage service *and* a manual map. Revisit only when a §8 break-even condition fires.

**Second anti-recommendation — do not build a generic SQL-parsing lineage extractor over this repo.** It will be confidently wrong about `/api/report` and `/api/scene-stats` and silent about `/api/chat`. A confidently wrong graph causes worse decisions than no graph, because people stop grepping.

---

## Sources

1. OpenLineage — [Column Lineage Dataset Facet](https://openlineage.io/docs/spec/facets/dataset-facets/column_lineage_facet/) — DIRECT/INDIRECT types, subtypes, `masking`.
2. OpenLineage — [Object Model](https://openlineage.io/docs/spec/object-model) — `Job`/`Run`/`Dataset`, event types, facets.
3. OpenLineage — [GitHub repository](https://github.com/OpenLineage/OpenLineage) — spec scope, integration list.
4. Marquez — [Marquez Project](https://marquezproject.ai/) — the OpenLineage reference server.
5. Astronomer — [OpenLineage + Airflow with Marquez](https://www.astronomer.io/docs/learn/marquez) — what an integration actually requires.
6. DataHub — [Lineage Impact Analysis](https://docs.datahub.com/docs/act-on-metadata/impact-analysis) — traversal workflow; the two named use cases.
7. DataHub — [Column-Level Lineage](https://datahub.com/blog/column-level-lineage-comes-to-datahub/) — the table-vs-column discrimination argument.
8. DataHub — [SQL Parsing](https://docs.datahub.com/docs/lineage/sql_parsing) — schema-aware parsing; confidence scores.
9. Metaplane — [Column-Level Lineage: An Adventure in SQL Parsing](https://www.metaplane.dev/blog/column-level-lineage-an-adventure-in-sql-parsing) — why `SELECT *` needs schema introspection.
10. sqlglot — [sqlglot.lineage API](https://sqlglot.com/sqlglot/lineage.html) — column lineage as a DAG of `Node` objects.
11. reata — [sqllineage](https://github.com/reata/sqllineage) — wildcard non-expansion; dynamic-SQL limits.
12. PostgreSQL — [pg_depend](https://www.postgresql.org/docs/current/catalog-pg-depend.html) — `refobjsubid` = column number; deptype codes.
13. Dimitri Fontaine — [Tables and Views dependencies](https://tapoueh.org/blog/2011/05/tables-and-views-dependencies/) — views depend on tables *through* `pg_rewrite`.
14. Databricks — [Lineage in Unity Catalog](https://docs.databricks.com/aws/en/data-governance/unity-catalog/data-lineage) — Spark-plan runtime capture; exclusions.
15. Snowflake — [Data Lineage](https://docs.snowflake.com/en/user-guide/ui-snowsight-lineage) — `OBJECT_DEPENDENCIES`, `ACCESS_HISTORY`, retention.
16. Google Cloud — [Dataplex lineage considerations](https://docs.cloud.google.com/dataplex/docs/lineage-considerations) — propagation latency; partial column coverage.
17. dbt Labs — [Node selector methods](https://docs.getdbt.com/reference/node-selection/methods) — `state:modified`, graph operators.
18. Ryan Kirsch — [dbt Exposures](https://www.ryankirsch.dev/blog/dbt-exposures-guide) — exposures as last-mile lineage; the `dbt ls` selector.
19. Dagster — [What Are Software-Defined Assets?](https://dagster.io/blog/software-defined-assets) — lineage as a byproduct of declaration.
20. Monte Carlo — [The Ultimate Guide to Data Lineage](https://montecarlo.ai/blog-data-lineage) — definitions (its time-savings claims are qualitative — cite no numbers from it).
21. DataHub — [Why Manual Lineage Maps Fail](https://datahub.com/blog/data-lineage-mapping/) — drift and lineage rot.
22. W. Koenders / ZS — [7 key drivers of data lineage costs](https://medium.com/zs-associates/7-key-drivers-of-data-lineage-costs-3cd84fd22586) — five- vs six-figure bands.

**Triton-internal evidence (measured from source, 2026-08-11):** `vercel.json`; `app/api/cron/pitches/route.ts:41-85`; `app/api/cron/refresh/route.ts:34-165`; `app/api/update/route.ts:182-193,241-285,306-352`; `app/api/compute-triton/route.ts:34-60`; `app/api/compute-deception/route.ts:27-50`; `scripts/create-refresh-league-averages.sql:10,481-545`; `scripts/create-refresh-league-percentiles.sql:449-505`; `scripts/create-materialized-views.sql:21,104-105,322-323,339-385`; `lib/queryCache.ts:47-72`; `lib/observability.ts:33`; `app/api/cron/integrity/route.ts:26-35`; `lib/dataIntegrity.ts:336-433`; `app/api/cron/daily-graphics/route.ts:327-356`; `app/api/explore/query/route.ts:13-21`; `app/api/chat/route.ts:98-155,353`.
