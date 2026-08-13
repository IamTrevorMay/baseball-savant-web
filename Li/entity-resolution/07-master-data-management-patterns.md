---
title: Master Data Management Patterns — Golden Records Without a Governance Department
domain: entity-resolution
tags:
  - master-data-management
  - golden-record
  - survivorship
  - registry-style
  - consolidation-style
  - stewardship
  - players-table
sources_reviewed: 21
last_updated: 2026-08-12
---

# Master Data Management Patterns — Golden Records Without a Governance Department

## TL;DR

- **Triton runs three MDM styles at once and chose none on purpose:** `players` is
  consolidation-style, `retro_id_map` registry-style, the TrackMan athlete space unmanaged
  coexistence. (computed)
- **`players` is the de facto master entity table and has six columns; `docs/VARIABLES.md:439`
  documents three.** A master record you cannot enumerate is not being managed. (computed)
- **Two opposite survivorship policies live in one codebase** — the ingest upserts
  `ignoreDuplicates: true` (first-writer-wins, forever), every repair path `onConflict: 'id'` with no
  attribute logic (last-writer-wins) — and precedence is the cron schedule. (computed)
- **That collision is why two name formats coexist** — 16,474 `"Last, First"` vs 457 `"First Last"`
  — and nothing rewrites the 457 unless the name is literally `'Unknown'`. (computed / estimated)
- **A golden attribute that is always NULL is worse than none:** `players.team` is 0% populated and
  still selected into a published newsletter graphic. (computed)
- **Triton already built a correct registry-style MDM subsystem in `retro_*` and did not reuse it:**
  crosswalk MV, typed conflict log, ingest ledger, per-row `source_version` — `players` has none of
  the four, and the same Chadwick register is ingested twice under different survivorship. (computed)
- **Match rate is the only identity number a one-person shop can govern**, and `players.lahman_id`
  sits at **19.07%**, refreshed by a hand-run script, no cron. (computed)
- **The expensive parts of MDM assume people** — councils, review queues, RACI, hubs — so the
  one-person substitution is **refusal, not review**: ambiguity becomes a blocking error or a logged
  conflict, never a silent pick. (established / estimated)

---

## 1. The four implementation styles, and what each commits you to

They differ on **who owns the attribute values** and **whether the hub writes back**; the taxonomy is
stable across DMBOK, Loshin, and vendor documentation. **(established)**

| Style | Hub stores | Writes back? | Fails when |
|---|---|---|---|
| **Registry** | keys only; record assembled at read time | No | reads slow; sources unavailable |
| **Consolidation** | copies of source attributes, read-only | No | copies drift; no authoritative copy |
| **Coexistence** | attributes, harmonized and echoed back | advisory | sync loops, conflicting edits |
| **Transaction** | attributes authored *in* the hub | sources read from hub | you must own every writer |

Decision rule: *can you write to the source?* Triton cannot — not Savant, MLB Stats API, Chadwick,
Retrosheet, or Lahman — which **eliminates coexistence and transaction outright**, leaving
registry-vs-consolidation per entity, decided on read latency. Advice pushing an authoring hub
assumes a company that owns its upstreams.

### 1.1 Triton's live diagnosis

| Entity space | Style in force (chosen?) | Evidence |
|---|---|---|
| `players` (MLBAM people) | **Consolidation** — copied in, never written back (no) | `app/api/update/route.ts:31–61` |
| Retrosheet/Lahman/bbref/FG IDs | **Registry** — keys only (yes) | `create-retro-tables.sql:228–236` |
| Lahman biography | **Consolidation**, second copy (partly) | `lahman_people` |
| TrackMan / Compete athletes | **Unmanaged coexistence** — two masters, no link (deferred) | `tm_pitcher_id` 443/443 vs `athlete_profile_id` 0/443 |
| Captury / Whoop | Registry via `athlete_profiles.player_id` (yes) | `mechanics/report/route.ts:39` |

**(computed)** Mixed-style MDM is normal; three of these five arriving by accretion, none written
down as a choice, is not.

---

## 2. What a golden record has to carry

A golden record is not "the best value" — it is **a value plus the four things that let a future
reader disagree with it.**

| Component | Purpose | In `players`? |
|---|---|---|
| Surviving **value** | the answer | Yes |
| **Source** | reproducibility, trust ranking | **No** |
| **Rule** that selected it | auditability of the merge | **No** |
| **As-of / observed-at** | temporal correctness (`temporal-modeling/06-slowly-changing-dimensions.md`) | `updated_at` |
| **Alternatives** it beat | lets you undo a bad merge | **No** |

Losing alternatives is irreversible: once `ignoreDuplicates: true` discards a competing name, that
name never existed as far as the database knows — the same loss as a destructive baseline upsert
(`metric-governance/10-audit-trails-provenance.md`). W3C PROV formalizes it: a derivation you
cannot attribute to an activity and an agent is not provenance, just a value. **So make the golden
record a *view* over retained source rows wherever that is cheap** — as `retro_id_map` is and
`players` is not. **(established / computed)**

---

## 3. Survivorship — the six rules, and the two Triton uses by accident

**Survivorship** picks a winner when sources disagree on one attribute of one entity, decided
**per attribute** — the classic error is naming a "best source" for the whole record.
**(established)**

| Rule | Picks | Failure mode |
|---|---|---|
| **Source priority** | highest-trust source with a value | authority varies by attribute and era |
| **Recency** | most recently observed | stale-but-correct loses to a fresh error |
| **Completeness** | first non-null, by priority | a wrong non-null beats a right null |
| **Frequency / voting** | modal value across ≥3 sources | Triton usually has two sources |
| **Longest / most specific** | richest string | favours junk |
| **Steward override** | a pinned human decision | **costs a human** (§6) |

### 3.1 What Triton actually does

Two rules, applied by whichever job runs first, no attribute-level logic:

| Path | Call | Effective rule |
|---|---|---|
| Pitch ingest inserts players | `.upsert(…, { onConflict:'id', ignoreDuplicates:true })` — `app/api/update/route.ts:60` | **First-writer-wins, permanently** |
| MiLB placeholders; WBC | `update/milb/route.ts:444`; `cron/wbc/route.ts:116` | First-writer-wins |
| Orphan repair; janitor fix | `lib/dataIntegrity.ts:129`,`:188`; `cron/janitor/route.ts` | **Last-writer-wins** |
| Roster / `populate-players` | `.update(…).eq('name','Unknown')` — `cron/roster/route.ts:14,49` | Last-writer-wins, **gated on the literal `'Unknown'`** |

**(computed)** Precedence between the two is not a rule, it is `vercel.json`: pitches 09:00 UTC,
roster 09:00 and 23:00, integrity 10:00, janitor 13:00.

### 3.2 The name-format split is this bug's fingerprint

Pitchers are inserted with Savant's `player_name` verbatim — `"Last, First"`
(`app/api/update/route.ts:21,40`); batters with the MLB API's `fullName` verbatim — `"First Last"`
(`:53`). Neither write normalizes. Both repair paths do, via two independent copies of one function
(`lib/dataIntegrity.ts:18–23` plus an inline duplicate in the janitor route), but fire only on
orphans or `name = 'Unknown'` — so a batter first seen through the MLB-API branch keeps
`"First Last"` forever. **Mechanism (computed); attributing all 457 rows to it (estimated).**

**Both normalizers are also wrong on suffixes:** they take the last whitespace token as the surname,
so *Vladimir Guerrero Jr.* becomes `"Jr., Vladimir Guerrero"`. `retro_people` has a `name_suffix`
column from Chadwick (`ingest-retrosheet.ts:449`); `players` has none. Accents compound it — **553 of
16,931 names are non-ASCII**, nothing normalizes Unicode, and `"Vázquez"` in NFC vs NFD are
different strings to Postgres. Algorithms belong to `03-name-matching-algorithms.md`; the point here:
**survivorship on a name is meaningless until the name has one canonical form.**
**(computed / established)**

### 3.3 The rule Li recommends for `players`

One function, explicit precedence, per attribute — not six call sites:

| Attribute | Rule | Precedence |
|---|---|---|
| `id` | immutable | MLBAM only; never inferred |
| `name` | source priority + normalization | MLB API `fullName` → Chadwick `name_first/last/suffix` → Savant `player_name`; NFC, stored `"Last, First"` |
| `position` | recency, then source priority | MLB Stats API over Savant-implied |
| `team` | **do not store** — derive as-of from `pitches` | — |
| `lahman_id` | completeness; never overwritten by null | Chadwick register only |

---

## 4. Auditing Triton's master entity

**`players` holds 16,931 rows with six columns; `id` runs 110001–842249 and *is* the MLBAM
identifier.** `CLAUDE.md` still says 4,017 — stale by 4.2×; `docs/VARIABLES.md:439` gives the grain
as `id, name, position`, half the columns. Coverage: `position` 64.4%, `lahman_id` 19.07%,
**`team` 0.0%**. **(computed)** A source ID as primary key is a defensible bet here, but a bet
(`11-id-schema-design.md`).

### 4.1 A structurally empty golden attribute that is still consumed

`app/api/starter-card/route.ts:78` selects `p.team` into the metadata block feeding the daily
starter-card graphic in the Mayday newsletter — and the column has **zero** populated rows.
How that renders is **Cas**'s (`Cas/analytics-ux/02-null-zero-unknown-ui.md`); whether the pipeline
should fill it is **Jo**'s (`Jo/data-quality/07-null-semantics-missingness.md`). Li's ruling is
narrower: **`team` is an attribute of a player-season, not a person.** Trades make it Type-2, so a
single-valued `players.team` cannot be correct for anyone ever traded — 0% is accidentally the
least-wrong state it has held.

One line down, `:84` joins `lahman_people` on `lp.key_mlbam` while six other references use `mlb_id`
— Chadwick's field name, consumed in memory at `import-lahman.ts:90`, never persisted under it.
**(computed)** Whether it exists is one query for **Jo**
(`Jo/data-quality/06-reconciliation-source-of-truth.md`); either way, **a crosswalk with two
spellings has two owners.**

### 4.2 Duplicate names are not yet a duplicate-entity problem

**16,418 distinct names over 16,931 rows → 513 collisions**, four-way on `Gonzalez, Jose` and five
others. **(computed)** With MLBAM IDs as the key that is harmless — until code resolves by name:
`app/api/chat/route.ts:362`,`:367` return top-n name matches with **no disambiguator (birth year,
debut, position)**. Adding one is the cheapest identity fix here; scoring and blocking are
`04-record-linkage-deduplication.md`'s.

---

## 5. The pattern Triton already built, in the wrong subsystem

| Artifact | What it does | Where |
|---|---|---|
| `retro_id_map` (MV) | key-only crosswalk `retro_id ↔ mlbam_id ↔ bbref_id ↔ fg_id` | `create-retro-tables.sql:228–236` |
| `retro_id_map_conflicts` | typed ambiguity log: `multiple_mlbam_for_retro`, `multiple_retro_for_mlbam`, `register_version` | `:243–255` |
| Conflict detection | two `GROUP BY … HAVING count(distinct …) > 1` probes per ingest | `ingest-retrosheet.ts:640–663` |
| `retro_ingest_runs`; `source_version` | run ledger; register vintage per fact | `:260`; `ingest-retrosheet.ts:456` |

**(computed)** Four of the five components §2 requires, for one file's cost. `players` — which
8.88M `pitches` and 2.51M `milb_pitches` rows join to — has **none of them**.

**And the same source is ingested twice, differently.** `import-lahman.ts:82–96` downloads the
Chadwick shards and keeps **only** `key_bbref → key_mlbam` in a plain JS object, discarding
`key_retro`/`key_fangraphs`; `ingest-retrosheet.ts:437–458` persists all four ID spaces plus name
parts and dates. One registry, two consolidations, no designated master — the exact failure
registry-style MDM prevents. The `lahman_id` backfill (`:224–244`) loops one `UPDATE` per crosswalk
row, is hand-invoked, and in no cron: **19.07% populated**, decaying. **(computed)** Cadence and
coverage SLOs are `02-crosswalk-construction-maintenance.md`'s.

---

## 6. Stewardship when the steward is one person

MDM's operating model assumes a governance function: stewards per domain, a match-review queue, an
escalation path, a council arbitrating definitions. **Every one is a headcount line**; prescribing
them at n=1 guarantees they are skipped and the risk unmanaged.

| Practice | Assumes | Verdict for Triton |
|---|---|---|
| Stewardship council / RACI | ≥3 people, competing interests | **Unaffordable.** Substitute the `docs/VARIABLES.md`-same-commit rule, test-enforced |
| Match-review queue | steward-hours ∝ arrival rate | **Only if bounded** (§6.1) |
| Commercial MDM hub | license + admin FTE | **Reject.** The hub is `players`; the gap is rules, not software |
| Trained linkage (Splink, dedupe) | labelled pairs, ongoing tuning | **Defer.** Exact MLBAM joins yield 0 orphans; buy for TrackMan only (`08-facility-athlete-linking.md`) |
| Data-quality dashboard | someone reads it | **Degenerate form only** — alert on non-empty |
| Domain ownership ("data mesh") | multiple owning teams | **Category error at n=1** |
| Survivorship rules engine | config UI, versioning | **Substitute 30 lines** — §3.3 as one function |

### 6.1 The three rules that replace a steward

1. **Refusal over review.** With nobody to work a queue, ambiguity must become a **blocking error**
   or **logged conflict**, never a silent pick — `ignoreDuplicates: true` is the opposite: silent
   pick, evidence destroyed. **(estimated)**
2. **Bound the arrival rate before committing to any manual step.** A queue is affordable at ~1
   item/week, abandoned at 10/day. The Aug 2026 check found **0 orphans over 453 MLB pitchers and
   444 MiLB batters**, so ambiguity arrives at near-zero rate and a conflict table would sit empty.
   **An empty queue is the goal, not waste** — a dead-man switch costing nothing until it fires.
   **(computed / estimated)**
3. **Prefer assertions to processes.** A process one operator must remember decays; a `CHECK`,
   partial unique index, or Vitest assertion does not
   (`metric-governance/09-metric-documentation-glossary.md`).

Existing checks follow rule 3: `lib/dataIntegrity.ts:97–152`,`:156–204` auto-remediate orphans from
the MLB People API daily at 10:00 UTC — why the count is 0 — but both carry `LIMIT 200` and filter
`game_year = ${year}`: **current-season and truncated**, blind to a backfill-introduced orphan. Alerting is **Jo**'s (`Jo/data-reliability/03-volume-completeness-monitoring.md`); the
*metric* is Li's: match rate by source, not orphan count (`09-identity-quality-monitoring.md`).

---

## 7. What Triton should do, in order

1. **Write the style choice down per entity space** (§1.1) in `docs/VARIABLES.md` — registry for
   external ID spaces, consolidation for `players`, explicit "no writeback, ever." Ten minutes, and
   it stops the accretion.
2. **Collapse the six upsert call sites onto one `upsertPlayers()` helper** implementing §3.3, with
   NFC + suffix-aware normalization and completeness merge; delete the duplicate `formatPlayerName`.
3. **Repair the 457 minority-format rows and the suffix cases through that helper**, so fix and rule
   share one code path.
4. **Add `players.source` and `players.name_suffix`**, stamped on every write — the §2 gap that
   cannot be reconstructed later.
5. **Copy `retro_id_map_conflicts` into an `identity_conflicts` table** for `players`: duplicate
   names *with overlapping active seasons*, `lahman_id` collisions, one `mlb_id` mapping to several
   `lahman_id`. Alert when non-empty.
6. **Resolve `key_mlbam` vs `mlb_id`** at `app/api/starter-card/route.ts:84`; one spelling repo-wide.
7. **Drop `players.team`**, or redefine as derived as-of; do not backfill a single-valued column.
8. **Put the `import-lahman.ts` step-9 backfill on a monthly cron**, register version recorded, so
   `lahman_id` coverage is monitored, not decaying.
9. **Then link TrackMan** — populate `athlete_profile_id` at insert
   (`08-facility-athlete-linking.md`); `rowToDb` already accepts it.

**Anti-recommendation — do not build a golden-record merge layer unifying `players`,
`lahman_people`, `retro_people`, and `athlete_profiles` into one master person table.** Every MDM
deck recommends it; it is wrong here three ways. **(i) It solves a problem Triton does not have:**
0 unresolved pitchers and batters means MLBAM-axis linkage is complete; the real defects are
normalization, survivorship, and provenance *within* `players`. **(ii) It destroys evidence to buy
convenience:** merging four stores with different `source_version` semantics means picking winners,
and Triton has no surviving alternatives to un-pick them (§2). **(iii) It has no maintainer** —
it needs a review queue and rule versioning, the headcount §6 rules out. The `retro_*`
registry answers the same questions by joining on keys, at maintenance cost zero.

**Single highest-leverage next action:** write `upsertPlayers()` — one function, the §3.3 precedence
table, NFC + suffix-aware normalization, `source` on every write — and route all six write paths
through it. It replaces two contradictory survivorship policies with one written-down rule and is the
prerequisite for everything above.

---

## Sources

1. [Gartner — MDM glossary](https://www.gartner.com/en/information-technology/glossary/master-data-management-mdm) — §1's implementation-style vocabulary.
2. [DAMA — DMBOK](https://www.dama.org/cpages/body-of-knowledge) — MDM as a governance function: what §6 removes.
3. [Loshin, *Master Data Management*](https://www.sciencedirect.com/book/9780123742254/master-data-management) — the registry/consolidation/coexistence split.
4. [Informatica — What is MDM](https://www.informatica.com/resources/articles/what-is-master-data-management.html) — vendor definitions of golden record and survivorship.
5. [W3C PROV-Overview](https://www.w3.org/TR/prov-overview/) — §2's "an unattributed value is not provenance."
6. [Kimball — SCD types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — why `players.team` is Type-2, not single-valued.
7. [Chadwick Bureau register](https://github.com/chadwickbureau/register) — the `people.csv` both ingests read; the `key_*` field names.
8. [Retrosheet](https://www.retrosheet.org/) — the ID space `retro_people` mirrors.
9. [SABR — Lahman Database](https://sabr.org/lahman-database/) — the `playerID` space `import-lahman.ts` loads.
10. [pybaseball](https://github.com/jldbc/pybaseball) — `playerid_lookup`: a working build of the crosswalk Triton builds twice.
11. [Smart Fantasy Baseball ID map](https://www.smartfantasybaseball.com/tools/) — an independent crosswalk, usable as a *check* on match rate.
12. [Baseball Savant — CSV field docs](https://baseballsavant.mlb.com/csv-docs) — `player_name`, the `"Last, First"` field stored verbatim (§3.2).
13. [MLB-StatsAPI wiki](https://github.com/toddrob99/MLB-StatsAPI/wiki) — the `people` endpoint supplying `fullName`, `primaryPosition`.
14. [Fellegi & Sunter (1969), JASA](https://www.tandfonline.com/doi/abs/10.1080/01621459.1969.10501049) — the framework §6 defers; a queue tunes its m/u weights.
15. [Christen, *Data Matching*](https://link.springer.com/book/10.1007/978-3-642-31164-2) — blocking and the precision/recall tradeoff behind §6's "TrackMan only."
16. [Splink docs](https://moj-analytical-services.github.io/splink/) — the labelling and tuning a linkage engine costs one operator.
17. [dedupe](https://github.com/dedupeio/dedupe) — active-learning ER; its labelling loop is what §6 rules out.
18. [dbt — snapshots](https://docs.getdbt.com/docs/build/snapshots) — cheap retention of superseded values, keeping survivorship reversible.
19. [PostgreSQL — pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) — the `similarity()` operator behind `search_players`.
20. [PostgreSQL — unaccent](https://www.postgresql.org/docs/current/unaccent.html) — accent-folding missing from the write path for 553 non-ASCII names.
21. [Unicode Annex #15](https://unicode.org/reports/tr15/) — why NFC and NFD make `"Vázquez"` two strings, and which to canonicalize.

**Triton-internal evidence.** From the central 2026-08-12 packet (not re-queried): `players` 16,931
rows / six columns, `id` 110001–842249; `lahman_id` 3,228 = 19.07%; `position` 10,899 = 64.4%;
`team` 0%; 16,474 `"Last, First"` / 457 `"First Last"`; 553 non-ASCII names; 16,418 distinct names →
513 collisions, four-way on `Gonzalez, Jose` (114931/467102/681275/683681) and five others; `pitches`
≈8,877,621 rows, `milb_pitches` ≈2,508,422; Aug 2026 orphan check: 0 over 453 MLB pitchers, 444 MiLB
batters; `compete_pitches` 443 rows, `tm_pitcher_id` 443/443, `athlete_profile_id` 0/443.
**Code read, not run:** first-writer-wins upserts `app/api/update/route.ts:60`,
`update/milb/route.ts:444`, `cron/wbc/route.ts:116`; last-writer-wins `lib/dataIntegrity.ts:129`,
`:188` and the janitor auto-fix; `'Unknown'`-gated repair `cron/roster/route.ts:14,49`,
`populate-players/route.ts:15,49`; verbatim names `app/api/update/route.ts:21,40` (Savant), `:53`
(MLB API); suffix-unsafe normalizer `lib/dataIntegrity.ts:18–23`; orphan checks
`lib/dataIntegrity.ts:97–152`,`:156–204`, `LIMIT 200`, `game_year = ${year}`; crons in `vercel.json`
(none for Lahman or Retrosheet); registry pattern
`scripts/create-retro-tables.sql:228–236`,`:243–255`,`:260`,
`scripts/ingest-retrosheet.ts:437–458`,`:449`,`:456`,`:640–663`; dual Chadwick ingest
`scripts/import-lahman.ts:82–96`; hand-run backfill `:224–244`; `key_mlbam` outlier
`app/api/starter-card/route.ts:84` vs `mlb_id` in `app/api/lahman/*`, `import-lahman.ts:104`,
`chat/route.ts:148`; `p.team` at `starter-card/route.ts:78`; name resolution
`chat/route.ts:362`,`:367`; TrackMan link omitted at `compete/performance/upload/route.ts:45`,
null-defaulted at `lib/compete/pitchSchema.ts:287`, deferred in `docs/compete-performance.md:59–63`;
`players` grain at `docs/VARIABLES.md:439`; stale 4,017 count in `CLAUDE.md`.
