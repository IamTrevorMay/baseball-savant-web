---
title: Schema Evolution & Data Contracts — Surviving Change You Don't Control
domain: data-quality
tags: [data-contracts, schema-drift, schema-registry, compatibility-modes, defensive-parsing, quarantine, expand-contract, restatement]
sources_reviewed: 22
last_updated: 2026-08-11
---

# Schema Evolution & Data Contracts — Surviving Change You Don't Control

## TL;DR

- **A data contract is an *enforced* interface spec, not a document** — schema, semantics, SLAs, ownership, versioning policy, plus a gate. Implementations fail organizationally (Sanderson's "nonconsensual APIs"); and when you don't own the producer there is nobody to negotiate with at all, so the contract lives entirely on your side of the boundary. (documented)
- **Triton has zero contract enforcement against its most important upstream.** `app/api/update/route.ts` reads Savant's header line, trusts whatever names appear, coerces types per-value, upserts. No expected column set, no type check, no range check, no assertion. (measured — code read 2026-08-11)
- **Here the *additive* change is loud and the *subtractive* one is silent — the reverse of standard guidance.** A new Savant column goes straight to PostgREST, which rejects the whole 500-row batch and triggers the per-row retry loop: ~12,000 doomed requests. A removed column just becomes NULL. (inferred from `route.ts:139-163`)
- **A one-line header check fixes the pipeline's worst ambiguity.** `route.ts:87` treats `csv.length < 100` as "no data," so an upstream error page and a no-games day are indistinguishable — and both set `totalInserted = 0`, gating `/api/cron/refresh` off entirely. (measured)
- **Coverage monitoring would NOT catch the next Stuff+ outage.** The scoring UPDATE guards only `release_speed IS NOT NULL` and `COALESCE`s the other three terms to zero, so if `pfx_x`/`pfx_z`/`release_extension` vanish, `stuff_plus` stays 100% populated and quietly becomes a velocity-only z-score. (inferred from `route.ts:319-333` — the key finding here)
- **Assert those four inputs per batch, not per row.** Savant legitimately nulls tracking on individual pitches, so row-level rejection quarantines good data. The signal is populated-fraction per column against a floor. (inferred)
- **Provider restatement is a contract problem, not a freshness problem.** Statcast reclassifies pitch types on historical rows, and `pitch_name` is the join key to `pitch_baselines` (`route.ts:326`) — reclassification re-buckets rows with no key change and no error. Triton's detector for this exists and has been ignored **54 times**. (inferred + measured)
- **On `pitches`, expand-migrate-contract is the only mechanically possible path**, since `ALTER COLUMN TYPE` rewrites 9.7 GB and 29 indexes under `ACCESS EXCLUSIVE` and `lock_timeout = 8s` aborts it. There is also no migration ledger: 31 ad-hoc `scripts/*.sql`, no `supabase/migrations/`. (documented + measured)

---

## 1. What a contract actually specifies

A contract is real only if something rejects a violation. Five parts; teams ship the first and stop:

| Part | Specifies | Triton today |
|---|---|---|
| **Schema** | names, types, nullability, domains | none at ingest; 4 partial Zod schemas on *read* surfaces |
| **Semantics** | units, grain, what NULL means | `docs/VARIABLES.md` (641 lines) — internal metrics only |
| **SLAs** | freshness, completeness, volume | none declared |
| **Ownership** | who gets paged | Trevor, implicitly, for everything |
| **Versioning** | what counts as breaking, notice period | none |

ODCS (Bitol) formalizes this list in YAML; dbt's `contract: {enforced: true}` is the narrow version, failing the build on removal or retype. Neither helps here — nobody at Savant will sign anything — so the contract reduces to: **what does the boundary code assert about what arrived?**

---

## 2. Compatibility modes — the taxonomy worth stealing

Confluent Schema Registry supplies the vocabulary. Its default is **BACKWARD**.

| Mode | Guarantee | Producer may | May not |
|---|---|---|---|
| **BACKWARD** (default) | new consumer reads old data | add optional fields, delete fields | add required fields |
| **FORWARD** | old consumer reads new data | add fields, delete optional fields | delete required fields |
| **FULL** | both | add/delete optional fields with defaults | touch anything required |
| **`*_TRANSITIVE`** | as above vs **all** prior versions | — | — |
| **NONE** | none | anything | — |

Triton's de-facto mode is **NONE**; it wants **BACKWARD with alerting**. One asymmetry the taxonomy assumes and Triton violates: a registry ignores unknown writer fields for free, while Triton forwards them into the `INSERT`. **"Additive is safe" is false here** until you add a projection step (§4.2).

---

## 3. Upstream drift and how each type fails at Triton

Path: `syncPitches()` — header at `:117`, coercion at `:130`, cleanup at `:139-141`, upsert at `:148-163`.

| Upstream change | What happens today | Failure mode | Detected? |
|---|---|---|---|
| Column **added** | key forwarded to PostgREST | batch errors → per-row retry → ~12k doomed requests | loud, as a mystery |
| Column **removed** | key absent; NULL for new rows | silent NULL; old rows keep stale values | **no** |
| Column **renamed** | removal + addition | both of the above at once | partially |
| **Retyped** (`95.1` → `"95.1 mph"`) | `!isNaN(Number(v))` fails → string → PG rejects | batch then row-by-row failure | loud, misattributed |
| **Value domain** grows (new `pitch_name`) | ingests fine; misses the baseline join | wrong bucket / no Stuff+ | warns — **ignored ×54** |
| Rows **restated** upstream | only the 3-day re-sync refreshes | permanent divergence outside 3 days | **no** (→ §7) |
| Upstream **error page** | `csv.length < 100` → "No data available" | `totalInserted = 0` → refresh chain skipped | **no** |

One landmine beyond the table: **`:130` types per value, not per column**, so a field usually numeric and occasionally textual gives mixed JS types within one batch.

---

## 4. The cheap fix, concretely

### 4.1 Distinguish "error page" from "no games" (do this first)

```ts
const lines = csv.split('\n')
if (!(lines[0] ?? '').includes('game_pk')) {
  throw new Error(`Savant returned a non-CSV body (status ${resp.status}, ` +
                  `${csv.length} bytes): ${csv.slice(0, 200)}`)
}
// header present + zero data lines == legitimate no-games day
```

It *throws*, so `trackCronRun` records a failed run and `reportError` fires, instead of a cheerful `{ fetched: 0 }` that silently gates the refresh chain off.

### 4.2 Column-set contract: project, then diff, then alert

Store the expected set beside the existing Zod schemas (`lib/schemas/savantPitch.ts`), generated once from a live header:

```ts
export const SAVANT_COLUMNS = new Set([/* the 90-odd names */])
export const CRITICAL_COLUMNS = new Set([
  'game_pk','at_bat_number','pitch_number','game_date','game_year','pitcher','batter',
  'pitch_name','pitch_type','release_speed','pfx_x','pfx_z','release_extension',
])

export function checkHeaderContract(headers: string[]) {
  const got = new Set(headers.filter(h => h && !h.startsWith('Unnamed')))
  const removed = [...SAVANT_COLUMNS].filter(h => !got.has(h))
  return {
    added: [...got].filter(h => !SAVANT_COLUMNS.has(h)),
    removed,
    criticalMissing: removed.filter(h => CRITICAL_COLUMNS.has(h)),
    hash: createHash('sha256').update([...got].sort().join(',')).digest('hex').slice(0, 16),
  }
}

// replaces the `delete r.id` / `Unnamed` cleanup at :139-141
const allowed = [...SAVANT_COLUMNS].filter(c => c !== 'id')
rows = rows.map(r => Object.fromEntries(allowed.map(c => [c, r[c] ?? null])))
```

Policy — BACKWARD compatibility at the row level: unchanged hash → proceed; `added` → **project away**, warn, keep ingesting; `removed` but none critical → proceed, warn; `criticalMissing` → **throw**. Persist `hash` to `system_metadata` so the **first** night of drift is the alert, not archaeology later.

### 4.3 Batch-level assertions on the four Stuff+ inputs

Row-level rejection is the wrong instrument (Savant legitimately nulls tracking on some pitches). The defended failure is *systematic*, so assert the rate.

```ts
const RANGES = { release_speed: [40, 110],     // mph, per Savant's csv-docs
                 pfx_x: [-5, 5], pfx_z: [-5, 5], release_extension: [3, 9] } as const  // feet

export function auditBatch(rows: Record<string, unknown>[]) {
  return Object.fromEntries(Object.entries(RANGES).map(([col, [lo, hi]]) => {
    const v = rows.map(r => r[col]).filter(x => x != null) as number[]
    return [col, { cov: v.length / rows.length,
                   oob: v.filter(x => typeof x !== 'number' || x < lo || x > hi).length }]
  }))
}
```

Assert `cov >= 0.90` and `oob === 0` on regular-season batches — in-memory arithmetic over rows already in hand, so **no round trip and the 8s RPC cap is irrelevant.** Zod (already a dependency, `zod ^4.4.3`) covers the key fields via `z.coerce.number().min().max().nullable()`; `lib/schemas/playerData.ts` is the precedent, though its `.passthrough()` + warn-and-return-raw posture is the opposite of what a boundary needs.

**Why these four.** From `applyStuffPlusForDateRange` (`route.ts:319-333`):

```sql
SET stuff_plus = ...  100
  + COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo, 0), 0) * 4.5
  + COALESCE((SQRT(POWER(p.pfx_x*12,2) + POWER(p.pfx_z*12,2)) - b.avg_movement)
             / NULLIF(b.std_movement, 0), 0) * 3.5
  + COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext, 0), 0) * 2.0
FROM pitch_baselines b
WHERE p.pitch_name = b.pitch_name AND p.game_year = b.game_year
  AND p.game_date = '<day>' AND p.release_speed IS NOT NULL
```

Only `release_speed` is guarded; the other three `COALESCE` to zero. **If `pfx_x`, `pfx_z`, or `release_extension` stopped arriving, `stuff_plus` would stay 100% populated and silently collapse to a velocity-only z-score** — every value drifting toward 100, coverage monitors green. Worse, `refreshPitchBaselines` (`:262-266`) filters those columns `IS NOT NULL`, so its `INSERT ... SELECT` returns zero rows, `ON CONFLICT` never fires, and the baseline row sits **stale rather than absent**, passing the existence check that is the only thing watching it. The 2026 outage with the detector removed. (inferred — reproduce on a scratch table first.)

---

## 5. Quarantine and dead-letter tables

Kafka Connect is the reference: `errors.tolerance = all` plus a dead-letter topic carrying rejection context — valid records keep flowing, invalid ones stay inspectable and replayable. **Triton has the hard half and throws it away:** the per-row retry loop at `route.ts:154-163` isolates the failing row and knows why, then `console.error`s it into a log nobody reads. Redirect that call:

```sql
CREATE TABLE ingest_quarantine (
  id           bigserial PRIMARY KEY,
  source       text        NOT NULL,   -- 'savant_statcast' | 'mlb_stats_api'
  ingested_at  timestamptz NOT NULL DEFAULT now(),
  natural_key  jsonb,                  -- {game_pk, at_bat_number, pitch_number}
  reason       text        NOT NULL,   -- schema_violation|range_violation|upsert_error
  detail       jsonb,                  -- zod issues / pg error
  payload      jsonb       NOT NULL    -- raw parsed row, verbatim, pre-coercion
);
CREATE INDEX ON ingest_quarantine (source, ingested_at DESC);
```

**Quarantine needs an SLO or it becomes a landfill** — assert `count(*) WHERE ingested_at > now() - interval '7 days'` = 0; an un-drained quarantine is a silent data gap wearing a table costume. Store the payload pre-coercion or you destroy the evidence of what the provider sent.

---

## 6. Detecting drift in your *own* schema

The header hash (§4.2) covers the provider; this covers your tables, including anything a script changed out of band:

```sql
SELECT md5(string_agg(column_name||':'||data_type||':'||is_nullable, ',' ORDER BY column_name))
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pitches';
```

Store per-table hashes in `system_metadata` and diff nightly: a change is either an intentional migration (whose commit should have updated the snapshot) or something nobody remembers doing. Airbyte's propagation settings are the policy menu — fields only / everything / manual approval / **stop future syncs**. For Triton: manual approval on `pitches`, propagate on derived.

---

## 7. Provider restatement — the contract problem nobody models

Savant is not append-only. Pitch types get reclassified and derived metrics recomputed on historical rows; the vocabulary has grown (Sweeper and Slurve are recent additions). Check locally with `SELECT pitch_name, min(game_year), count(*) FROM pitches GROUP BY 1`. (documented that it changes; *(verify)* which names and when.)

1. **Reclassification silently re-buckets Stuff+.** `p.pitch_name = b.pitch_name` is the join, so a pitch reclassified Slider → Sweeper is scored against a different baseline with no key change, no error, no row-count movement — and the shift looks like the pitcher changed. → `Li/metric-governance/09-metric-documentation-glossary.md`.
2. **The 3-day re-sync is the only restatement channel, and it is 3 days wide.** Restatements to rows older than 72 hours never reach Triton, and the divergence is invisible because both sides hold a row with the same natural key. → `06-reconciliation-source-of-truth.md`.
3. **The detector exists and is ignored.** `checkNewPitchNames` (`lib/dataIntegrity.ts:226-249`) diffs distinct `pitch_name` against `PITCH_NAME_TO_ABBREV` — exactly the right enumerated-domain check. **54 warns, max 8 unknown names**, and `warn` doesn't throw. It also returns `warn` when the *query* fails, so "could not evaluate" is indistinguishable from "found 8."

The fix is a sampler: re-pull ~200 rows for a 30-day-old game and report the disagreement rate. Non-zero disagreement isn't corruption — it's the provider working — but it invalidates aggregates cached before it.

---

## 8. Versioning your own schema

**Measured 2026-08-11:** 31 files in `scripts/*.sql`, no `supabase/migrations/`, no ledger table. Application is recorded in *code comments* (`create-pitch-playlists.sql:7`: "Applied to prod 2026-07-10"). Several scripts are idempotent (`create-league-averages.sql:29`) — instinct compensating for a missing system. The gap: no ordering, no down path, no way to know prod's schema except by asking prod. **Worse here than in a typical app:** `lib/sql.ts` builds queries as **strings** passed to `run_query`, so a rename that breaks 40 query builders produces zero compile errors and a runtime failure in production. The Zod schemas in `lib/schemas/` are the only compile-time-shaped contract in the repo, and they guard reads.

### 8.1 Expand-migrate-contract on `pitches`

Parallel Change (Sato, 2014): expand to serve old and new at once, migrate readers, contract away the old; `pgroll` automates it via views plus dual-write triggers. On 9.7 GB with 29 indexes and both timeouts at 8s, this is not a style preference:

| Operation | Cost on `pitches` | Verdict |
|---|---|---|
| `ADD COLUMN x real` (no volatile default) | metadata-only, ms at 8.89M rows | **safe** |
| `ADD COLUMN` w/ volatile default or stored generated | full table + 29-index rewrite, `ACCESS EXCLUSIVE` | impossible via `run_mutation` |
| `ALTER COLUMN TYPE` (non-binary-coercible) | full rewrite + index rebuild | impossible — aborts on `lock_timeout` |
| `RENAME COLUMN` | instant | **atomically breaks every string-built reader** |
| `DROP COLUMN` | metadata-only | safe; space reclaims on next rewrite |
| Backfill | chunk by `game_date`, ~4k rows/stmt (~1.4s), VACUUM between | the only viable migrate phase |

Recipe: **expand** (`ADD COLUMN stuff_plus_v2 real` — instant) → **dual-write** (a second `SET` in the scoring UPDATE) → **migrate** (chunked backfill by `game_date`, `WHERE stuff_plus_v2 IS NULL`, VACUUM between batches — a full backfill makes ~8.9M dead tuples) → **cut readers over** in one commit with `docs/VARIABLES.md` → **contract** (`DROP COLUMN stuff_plus`) only after a nightly cycle proves the new column populated.

### 8.2 Giving `docs/VARIABLES.md` teeth

It is Triton's closest thing to a contract for its own metric surface, and the same-commit convention is good practice, under-enforced because nothing checks. Enforcement is ~8 lines in a pre-commit hook: fail if `git diff --cached --name-only` matches `lib/(reportMetrics|sql|metricRegistry|sceneTypes)\.ts` but not `docs/VARIABLES.md`. Cheapest contract enforcement in the repo. → `Li/metric-governance/09-metric-documentation-glossary.md` for what belongs *in* it; this doc cares only that it stays true.

---

## 9. What Triton should do, in order

1. **Reject non-CSV bodies at `route.ts:87`** — `lines[0].includes('game_pk')`, else throw. Separates "Savant is down" from "no games today" and stops a silent nightly no-op of the refresh chain. Highest risk-removed-per-line in the repo.
2. **Project rows to the known column set before upsert** (§4.2). One line; turns additive drift from a ~12,000-request catastrophe into a no-op.
3. **Add `checkHeaderContract`, persist the hash.** Alert on any diff; throw only on `criticalMissing`.
4. **Add `auditBatch` on the four Stuff+ inputs** (§4.3). In-memory, no RPC, immune to the 8s cap. **This catches what coverage monitoring cannot see.**
5. **Create `ingest_quarantine`, point the per-row error handler at it** (`:154-163`) — the isolation logic exists and just discards its output. Add the 7-day-empty assertion with it.
6. **Make `new_pitch_names` capable of failing** — a distinct `errored` status on the query-error branch, `/api/cron/integrity` throwing on anything outside `pass|warn|remediated`, then read the 8 names.
7. **Add the `information_schema` hash snapshot** (§6); **enforce `VARIABLES.md` in CI** (§8.2).
8. **Later, if earned:** a restatement sampler (§7) and a migration ledger.

### Anti-recommendation

**Do not adopt a data contract framework** — not ODCS, not the Data Contract CLI, not dbt model contracts, not a schema registry. All four solve a problem Triton doesn't have: coordinating *many* producers with *many* consumers across team boundaries. Triton has one producer that will never sign anything, one consumer, one operator. A YAML contract for Savant would describe the data and enforce nothing — the exact failure Sanderson diagnoses.

**Also do not stage-and-validate before promotion.** Write-Audit-Publish would roughly double the nightly write cost where 29 indexes and an 8s timeout already bind; take the audit step alone (→ `data-reliability/01-pipeline-observability-fundamentals.md` §5.1 and `09-external-api-ingestion.md`).

The contract Triton needs is a Set of 90 strings, four numeric ranges, and a `throw` — about 60 lines. Build nothing until those have caught something.

---

## Sources

1. Sanderson — [The Rise of Data Contracts](https://dataproducts.substack.com/p/the-rise-of-data-contracts) (2022) — the "nonconsensual API" framing.
2. Sanderson & Kreuziger — [An Engineer's Guide to Data Contracts, Pt. 1](https://dataproducts.substack.com/p/an-engineers-guide-to-data-contracts) (2022).
3. Jones — [Data Contracts — the book](https://andrew-jones.com/blog/data-contracts-the-book-out-now/) (O'Reilly, 2023).
4. Jones — [Why I wrote a book on data contracts](https://andrew-jones.com/blog/why-i-wrote-a-book-on-data-contracts/) — producer ownership is load-bearing.
5. Bitol — [Open Data Contract Standard](https://bitol-io.github.io/open-data-contract-standard/latest/) — source of the §1 list.
6. [Data Contract CLI](https://github.com/datacontract/datacontract-cli) — lint, test, export ODCS contracts.
7. dbt — [Model contracts](https://docs.getdbt.com/docs/collaborate/govern/model-contracts) — build fails on removal or retype.
8. Confluent — [Schema Evolution and Compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html) — source of the §2 table.
9. Confluent — [Schema Registry overview](https://docs.confluent.io/platform/current/schema-registry/index.html).
10. Apache Avro — [Schema resolution](https://avro.apache.org/docs/1.12.0/specification/) — name matching, reader defaults.
11. Protocol Buffers — [Proto3: Updating A Message Type](https://protobuf.dev/programming-guides/proto3/).
12. Confluent — [Kafka Connect: Error Handling and Dead Letter Queues](https://www.confluent.io/blog/kafka-connect-deep-dive-error-handling-dead-letter-queues/) — model for §5.
13. Airbyte — [Schema change management](https://docs.airbyte.com/using-airbyte/schema-change-management) — the §6 policy menu.
14. Zod — [Introduction](https://zod.dev/) — already a Triton dependency (`package.json:44`).
15. Zod — [API reference](https://zod.dev/api) — `z.strictObject`, `.catchall()`, `z.coerce.*`.
16. Sato — [ParallelChange](https://martinfowler.com/bliki/ParallelChange.html) (2014).
17. [pgroll](https://github.com/xataio/pgroll) — expand-contract via views and dual-write triggers.
18. [strong_migrations](https://github.com/ankane/strong_migrations) — renames break the app; NOT NULL scans every row.
19. PostgreSQL — [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — basis for §8.1.
20. Braintree — [Schema Changes Without Downtime](https://medium.com/braintree-product-technology/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680).
21. PostgreSQL Wiki — [Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This).
22. Baseball Savant — [Statcast Search CSV Documentation](https://baseballsavant.mlb.com/csv-docs) — the only published description of the ingest's column set; `pfx_x`/`pfx_z`/`release_extension` in **feet**, hence the §4.3 ranges and the `*12`.

**Triton-internal evidence (measured 2026-08-11, code read):** `app/api/update/route.ts` `:87`, `:117`, `:126`, `:130`, `:139-141`, `:148-163`, `:262-266`, `:319-333`; `lib/dataIntegrity.ts:226-249`; `lib/schemas/playerData.ts`; `docs/VARIABLES.md`; 31 `scripts/*.sql`, no `supabase/migrations/`. Integrity history and table sizes from `Jo/context/triton-context.md`.
