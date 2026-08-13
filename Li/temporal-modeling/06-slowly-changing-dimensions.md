---
title: Slowly Changing Dimensions — Which Attributes Earn a History Table, and Which Don't
domain: temporal-modeling
tags:
  - slowly-changing-dimensions
  - kimball
  - effective-dating
  - type-2
  - dimension-design
  - rosters
  - pitch-classification
  - durable-keys
sources_reviewed: 17
last_updated: 2026-08-12
---

# Slowly Changing Dimensions — Which Attributes Earn a History Table, and Which Don't

## TL;DR

- **There are eight named SCD types, not six, and the numbering is not a scale.** Kimball's canon is 0–7; Types 4/5/6/7 are *structural* answers — mini-dimension, outrigger, hybrid, dual keys — not "more history than 2." **(established)**
- **`players` is a pure Type 1 dimension**: six columns, overwritten in place, no effective dating, no history table. Every past value of every attribute is already gone. **(computed)**
- **The attribute most obviously needing Type 2 is not un-historized, it is empty:** `players.team` is populated on 0 of 16,931 rows; `position` on 64.4%; `lahman_id` on 19.07%. **(computed)**
- **`players.team` should be dropped, not historized** — it is derivable from `inning_topbot` + `home_team`/`away_team`, so a stored copy can only agree with the facts or disagree with them. **(computed)**
- **`players.position` should not be Type 2 either: its valid time is unobtainable.** MLB's `primaryPosition` reports *today*, and the cron only reads `'Unknown'` rows. **(computed)**
- **Pitch classification earns Type 2 and is the one modelled as Type 0/1** — 18 hardcoded mappings in TypeScript, `pitch_baselines` at 206 rows with no timestamp. It is also the only one whose wrong as-of answer changes a *number*. **(computed)**
- **The durable key is free:** the MLBAM id survives name changes and trades, so Type 7 costs nothing. **(established)**
- **Storage is not the blocker; the name column is.** A full history is ~0.08% of `pitches`, but `name` carries 513 collisions, 553 non-ASCII rows and two formats, so a check-strategy load versions cosmetics. **(computed)**
- **Type 2 records *transaction* time unless the source supplies an effective date — none here does.** Calling a load timestamp a valid-from is how an SCD2 table lies. **(established)**

---

## 1. The types, precisely

Kimball's set runs 0–7: Types 1–3 are the classic three, Design Tip #152 named 0, 4, 5, 6, 7. "Which type" is half a decision — the other half is *which attribute*, since a dimension routinely mixes types column by column.

| Type | Kimball's definition | Costs you |
|---|---|---|
| **0** | retain original: "the dimension attribute value never changes, so facts are always grouped by this original value" | silent staleness |
| **1** | overwrite in place | **all** history, irreversibly |
| **2** | add a new row: new surrogate key + effective dates + current flag | joins must resolve as-of |
| **3** | add a new attribute (`prior_position` beside `position`) | remembers exactly **one** change |
| **4** | "a group of dimension attributes are split off into a separate mini-dimension," FK'd from the *fact* | only for fast-changers |
| **5** | Type 4 + a Type-1 "current profile" mini-dim key on the base dimension | two paths to keep in sync |
| **6** | Type 2 rows that *also* carry current-value columns | restate every version on change |
| **7** | fact carries **both** the Type-2 surrogate key **and** the durable key | wider facts; two views |

Two corrections to the folk version. **Type 4 is not "more than 3"** — it partitions a dimension by volatility, and 5/6/7 are compositions, not increments. And "Type 6 = 1+2+3" is arithmetic coincidence: Kimball defines Type 6 as adding Type 1 attributes to a Type 2 dimension, no Type 3 column involved. SSIS's naming is a useful cross-check — *changing* = 1, *historical* = 2, *fixed* = 0, no Type 3 — plus a case Triton lives in daily, the **inferred member** (§6.2). **(established)**

---

## 2. What Triton actually has

| Dimension | Grain | De-facto type | Should be |
|---|---|---|---|
| `players.name` | player | **1** (3 writers) / **0** (6 writers) | 2, after cleanup (§6.3) |
| `players.position` | player | **1** nominally, **0** in practice | derived, season grain (§3.1) |
| `players.team` | player | **1** over an empty column | **dropped** (§3.2) |
| `players.lahman_id` | player | **0** — write-once crosswalk | 0, correctly |
| `pitch_baselines` | `(pitch_name, game_year)` | **1**, destructive upsert | 2 — append + version |
| `PITCH_NAME_TO_ABBREV` | pitch name | **0**, hardcoded in TS | 2 (§3.3) |
| `pitches.player_name` | **fact row** | accidental **0/2 hybrid** | keep, reconcile (§4) |
| `compete_pitches.pitcher_team` | fact row | free-text **0** | keep; resolve on read |
| `player_season_stats` | player × season × group | **2-equivalent** | the model to copy |

`players` is six columns — `id`, `name`, `position`, `team`, `updated_at`, `lahman_id` — 16,931 rows, 1,632 kB; `docs/VARIABLES.md:439` documents only "id, name, position," so the glossary does not know `team` exists. Only `player_season_stats` is already right: its PK `(player_id, season, stat_group)` puts season in the grain, so history accumulates — Type 2 in all but name. It has **no team column either**, so nowhere is a player's organization in a season durably recorded. **(computed)**

---

## 3. Why three attributes get three different answers

All three are Type 1 today, with comparable volatility, yet deserve three *different* treatments. The discriminator is not change frequency but **whether the source supplies a valid time, and whether the facts already encode the answer.**

| Test | `players.position` | `players.team` | `pitch_name` / baselines |
|---|---|---|---|
| Queried as-of? | rarely | occasionally | **yes — every Stuff+ score** |
| Source gives an effective date? | **no** (`primaryPosition` = today) | **no** (roster API = today) | **no** (Savant restates in place) |
| Facts already determine it? | partly (appearance ⇒ role) | **yes, per pitch** | no — the label *is* the fact |
| Wrong answer changes a **number**? | no | no | **yes** — rebuckets the z-score |
| Verdict | derive at season grain | **drop it** | **Type 2, urgently** |

### 3.1 `position` — historizing it would record the wrong clock

`position` is populated on 10,899/16,931 rows (64.4%), always from MLB's `primaryPosition.abbreviation`, and the write paths fire only where `name = 'Unknown'` (the roster cron filters `.eq('name','Unknown')` before fetching). So once a player has a real name **his position is never refreshed again**: nominally Type 1, behaviourally Type 0, with no marker. **(computed)**

A history table on that source yields an honest *transaction*-time record ("first observed 1B on 2026-03-14") and a fictitious valid-time one, because the API reports state, not change — and Kimball's Type 2 assumes the ETL *sees* the change. Instead **derive** season-grain position from the facts: appearances in `pitches`/`milb_pitches`, `stat_group` in `player_season_stats`, Retrosheet pre-2015 — effective-dated at zero modelling cost, because the facts are already dated. Identity that *changes* is `entity-resolution/05-temporal-identity-changes.md`.

### 3.2 `team` — the plausible Type 2 that should be a `DROP COLUMN`

`players.team` is the attribute every SCD tutorial uses as its example, and here it is populated on **0 of 16,931 rows**. Three independent reasons to delete rather than historize. **Volatility class:** trades, waivers, options and IL moves change org membership several times a season, which by Kimball's own logic is a fast-changer — a Type 4 mini-dimension or a fact-side attribute, never a base-dimension Type 2. **It is derivable, exactly:** the pitcher's team is `home_team` when `inning_topbot = 'Top'` and `away_team` when `'Bot'` — the derivation the MiLB player page already runs for `vs_team` — so a stored copy can only agree (redundant) or disagree (wrong). **And an empty column is a hazard:** `WHERE team = 'MIN'` returns zero rows with no error, indistinguishable from "nobody plays for Minnesota."

If a roster-as-of question is ever asked, the answer is a **derived `player_team_stints` table** built from pitch facts — first/last `game_date` per player × team × season, gaps as separate stints. Franchise continuity is `entity-resolution/06-team-league-hierarchies.md`; Lahman's `Teams.csv` ships it already.

### 3.3 Pitch classification — the one that changes a number

This dimension fails the only test that matters: a wrong as-of answer changes a stored metric. Stuff+ z-scores each pitch against `pitch_baselines` keyed `(pitch_name, game_year)`, so a pitch's *label* selects its baseline row — and Savant restates labels retroactively. The 2023 addition of Sweeper and Slurve relabelled historical pitches, and the residue is in the repo: `PITCH_TYPE_TO_ABBREV` carries **both** `SW → 'sw'` and `ST → 'st'` while `PITCH_NAME_TO_ABBREV` maps `'Sweeper' → 'sw'` — one pitch, two abbreviations. **(computed)**

Three Type-0/1 structures stack: **`PITCH_NAME_TO_ABBREV`**, 18 entries hardcoded in `lib/constants-data.ts`, whose only guard (`checkNewPitchNames`) warns on *unknown* names and is blind to reclassification since a relabelled pitch carries a known name; **`pitch_baselines`**, 206 rows rebuilt nightly via `ON CONFLICT … DO UPDATE`, pure Type 1 on the input to every Stuff+ value and the cause of the 2026-08-11 two-vintage rescore of ≈249,000 rows; and **`pitches.pitch_name`**, a Type 1 attribute inside a fact table.

Prescription: Type 2 on `pitch_baselines` — append a version, expose a `latest` view — per `metric-governance/02` §5, ledger in `metric-governance/10` §7. What to do when the *label* changes is `temporal-modeling/09-retroactive-restatement.md`; whether it *should* change Stuff+ is Soto's call.

---

## 4. The Type 2 dimension already hiding in the facts

`pitches` stores `player_name` on every row beside the `pitcher` integer, written once at ingest and never revisited, so across ~8.88M rows it holds the pitcher's name **as of ingest day** while `players.name` has been overwritten since — including by a reformatter that rewrites `"First Last"` into `"Last, First"`. That is a Type 0 attribute inside a fact table: Kimball's Type 7 shape, by accident. It is **the only surviving record of a player's past names**, at day grain, for free — and it makes the dimension's decay measurable with no schema change:

```sql
-- Frozen fact-side name vs the current dimension. Run once; log in docs/Queries.md.
SELECT p.pitcher, p.player_name AS at_ingest, pl.name AS now,
       min(p.game_date) AS first_seen, max(p.game_date) AS last_seen, count(*) AS n
FROM pitches p JOIN players pl ON pl.id = p.pitcher
WHERE p.player_name IS DISTINCT FROM pl.name
GROUP BY 1,2,3 ORDER BY n DESC LIMIT 200;
```

Expect a large but *uninteresting* first result — most disagreements are format, not identity. Normalize both sides first; what survives is the real change set and the seed for any Type 2 backfill.

---

## 5. Effective-dated design in Postgres

Postgres has no SQL:2011 `PERIOD FOR` or system-versioning — the wiki still calls that work ongoing. Use plain `date` columns **plus** a `btree_gist` exclusion constraint for non-overlap, and decline `temporal_tables`: its `versioning()` trigger records *system* time; the gap here is valid time.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE player_attr_versions (
  version_id   bigserial PRIMARY KEY,
  player_id    int  NOT NULL,                  -- durable key: the MLBAM id (Type 7)
  name         text,
  position     text,
  valid_from   date NOT NULL,
  valid_to     date,                           -- NULL = current
  time_basis   text NOT NULL DEFAULT 'transaction'
                 CHECK (time_basis IN ('valid','transaction')),
  source       text NOT NULL,                  -- 'mlb-people' | 'savant-fact' | …
  EXCLUDE USING gist (player_id WITH =,
                      daterange(valid_from, valid_to, '[)') WITH &&)
);
CREATE INDEX ON player_attr_versions (player_id, valid_from DESC);
```

**`time_basis` is mandatory** because no source here supplies an effective date, and stamping `valid_from = now()` while calling it valid time is the standard way an SCD2 table lies. **`source` is mandatory** because §4 reconstructs history from two populations of differing reliability and survivorship rules must know which won (`entity-resolution/07-master-data-management-patterns.md`). `players` stays as the current-row view — Type 7.

---

## 6. Load mechanics, and what will bite

### 6.1 Change detection: `updated_at` cannot be trusted

dbt's snapshots are the reference for SCD2 loading, with two strategies: **timestamp** (watch one `updated_at`; the recommended one) and **check** (compare a named column list). Triton cannot use timestamp today: of ~nine write sites touching `players`, only three set `updated_at` — the pitch ingest, the MiLB placeholder, the WBC ingest, both `dataIntegrity` orphan upserts, the name backfill and the Lahman backfill all skip it. A snapshot keyed on `updated_at` would silently miss most changes — the worst failure mode available, because the history table would still look complete. Use the **check strategy** on `(name, position)` until every writer stamps it. **(computed)**

### 6.2 Inferred members are the normal case, not an edge case

Triton mints SSIS's **inferred members** three ways — the pitch ingest inserts `{id, name}` from the fact's own `player_name`, the MiLB ingest inserts `{name:'Unknown', position:null}`, the janitor and integrity checks upsert from the MLB API — and the roster cron resolves `'Unknown'` later, so an SCD2 load needs an explicit rule that **resolving one updates the existing version rather than creating a new one**. `'Unknown' → 'Ryan, Joe'` completes a stub; without the rule, every player who entered via MiLB gets a fabricated name change.

### 6.3 Cost is not the blocker; the name column is

The storage argument is over before it starts: `players` is **1,632 kB** against `pitches` at **9,711 MB**, so five versions per player is ~8 MB — **0.08%** of the pitch table, and no `ALTER TABLE` on anything hot. The real blocker is that **`name` is not clean enough to track**: 16,418 distinct names over 16,931 rows (513 collisions), 553 non-ASCII rows, two formats (16,474 `"Last, First"`, 457 `"First Last"`) — so a check-strategy snapshot versions cosmetics. **Normalize first, then historize** (`entity-resolution/03-name-matching-algorithms.md`). `last_analyze` is NULL everywhere inspected, so the §4 scan plans on default statistics until someone runs `ANALYZE`. **(computed)**

---

## 7. What Triton should do, in order

1. **`ALTER TABLE players DROP COLUMN team`**, updating `docs/VARIABLES.md:439` in the same commit. 0% populated, derivable from the facts, currently a silent-empty-result trap.
2. **Label the surviving columns with their type in the glossary** — `name`: Type 1; `position`: Type 0 in practice; `lahman_id`: Type 0 crosswalk. It stops the next reader assuming `position` is current.
3. **Make every `players` writer stamp `updated_at`** — six call sites, one line each. Precondition for a timestamp-strategy snapshot, and for detecting drift at all.
4. **Run the §4 reconciliation once**, normalized both sides and logged in `docs/Queries.md`, to size the real name history before storing any.
5. **Ship `pitch_baselines` versioning (Type 2)** per `metric-governance/02` §5 — the only change here that alters a *number*.
6. **Add `player_attr_versions` (§5) with `time_basis = 'transaction'`**, seeded from step 4, `players` kept as the current-row view (Type 7). Load check-strategy on `(name, position)` plus the §6.2 rule.
7. **Derive `player_team_stints` from the pitch facts** if and when a roster-as-of question is asked — not before.

**Anti-recommendation — do not convert `players` into a Type 2 dimension with `valid_from`/`valid_to` populated from load timestamps.** It is what the literature seems to endorse, and it fails three ways. **(i) There is no history to load:** every prior value was destroyed by in-place `UPDATE`s, so the conversion stamps 16,931 rows with `valid_from = now()` and manufactures a history whose first version lies about when it began — the fabrication rejected for `pitches.baseline_version` in `metric-governance/10` §8, worse here because it *looks* complete. **(ii) The clock is wrong going forward:** MLB's endpoint returns current state with no effective date, so `valid_from` records when a cron ran, not when a player moved — and it only reads `'Unknown'` rows, so for 64% of the table it never runs again. **(iii) The tracked column isn't clean:** 513 collisions, 553 non-ASCII rows and two name formats mean the load versions cosmetics. Two smaller don'ts: do not install `temporal_tables` (system time, not the missing valid time), and do not model `team` as a Type 4 mini-dimension — the facts answer it.

**Single highest-leverage next action:** run item 1. It removes a column that can only produce silently-empty results, costs nothing, and forces `docs/VARIABLES.md:439` to be corrected in the same commit — where item 2's labels go.

---

## Sources

1. Kimball — [Design Tip #152: SCD Types 0, 4, 5, 6, 7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — the Type 0/4/5/6/7 definitions quoted in §1.
2. Kimball — [SCDs, Part 1](https://www.kimballgroup.com/2008/08/slowly-changing-dimensions/) — Types 1–3; type is per *attribute*, not per table.
3. Kimball — [SCDs, Part 2](https://www.kimballgroup.com/2008/09/slowly-changing-dimensions-part-2/) — Type 2 mechanics; the natural key as glue between versions.
4. Kimball — [Design Tip #147: Durable "Super-Natural" Keys](https://www.kimballgroup.com/2012/07/design-tip-147-durable-super-natural-keys/) — why a source-independent key precedes Type 2/7 (§5).
5. Kimball — [Dimensional Modeling Techniques (PDF)](https://www.kimballgroup.com/wp-content/uploads/2013/08/2013.09-Kimball-Dimensional-Modeling-Techniques11.pdf) — the list §1 was checked against.
6. Kimball — [Design Tip #107: SQL MERGE for SCDs](https://www.kimballgroup.com/2008/11/design-tip-107-using-the-sql-merge-statement-for-slowly-changing-dimension-processing/) — the expire-then-insert load §6 assumes.
7. Wikipedia — [Slowly changing dimension](https://en.wikipedia.org/wiki/Slowly_changing_dimension) — the "Type 6 = 1+2+3" mnemonic §1 corrects.
8. Microsoft Learn — [SCD Transformation (SSIS)](https://learn.microsoft.com/en-us/sql/integration-services/data-flow/transformations/slowly-changing-dimension-transformation) — changing/historical/fixed → Types 1/2/0, and **inferred member** (§6.2).
9. dbt Labs — [Snapshots](https://docs.getdbt.com/docs/build/snapshots) — timestamp vs check strategy; §6.1.
10. PostgreSQL — [Range Types](https://www.postgresql.org/docs/current/rangetypes.html) — `daterange`, `[)` bounds, `&&` for §5's constraint.
11. PostgreSQL — [btree_gist](https://www.postgresql.org/docs/current/btree-gist.html) — puts `player_id WITH =` beside a range in one `EXCLUDE`.
12. PostgreSQL Wiki — [SQL2011 Temporal](https://wiki.postgresql.org/wiki/SQL2011Temporal) — `PERIOD FOR` is still proposed work, so §5 uses ranges.
13. arkhipov — [temporal_tables](https://github.com/arkhipov/temporal_tables) — the `sys_period` design §5 declines.
14. Kulkarni & Michels (2012) — [Temporal Features in SQL:2011](https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf), SIGMOD Record 41(3) — application- vs system-time; behind `time_basis`.
15. Snodgrass — [Time-Oriented Database Applications in SQL](https://www2.cs.arizona.edu/~rts/tdbbook.pdf) — valid-time state tables and sequenced queries; the basis for as-of reads.
16. Fowler — [Time narrative](https://martinfowler.com/eaaDev/timeNarrative.html) and [Effectivity](https://martinfowler.com/eaaDev/Effectivity.html) — "actual" vs "record" time, what `time_basis` encodes.
17. SABR — [The Lahman Baseball Database](https://sabr.org/lahman-database/) — `Teams.csv` (`yearID`/`teamID`/`franchID`), a pre-built Type 2 team dimension (§3.2); the canonical distribution now that the Chadwick Bureau's `baseballdatabank` repo is retired (404, checked 2026-08-12). Field semantics from [Savant CSV docs](https://baseballsavant.mlb.com/csv-docs).

**Triton-internal evidence.** Code-verified 2026-08-12. `players` writers omitting `updated_at`: `app/api/update/route.ts:58–61`, `app/api/update/milb/route.ts:436–447` (`'Unknown'` placeholder), `app/api/cron/wbc/route.ts:113–117`, `lib/dataIntegrity.ts:126–133` and `185–192`, `app/api/backfill-players/route.ts:54`, `scripts/import-lahman.ts:236–238`; writers that *do*: `app/api/cron/roster/route.ts:49–53`, `app/api/populate-players/route.ts:49–53`, `app/api/cron/janitor/route.ts:456–463`. The `'Unknown'`-only selection is `roster:13–14`; the `"Last, First"` reformatter is re-implemented at `roster:44–47`, `populate-players:44–47`, `janitor:452–455`. Pitch classification: `lib/constants-data.ts:71–78` (18 entries) and `:81–86` (`SW` and `ST`); `checkNewPitchNames` `lib/dataIntegrity.ts:215–249`; `refreshPitchBaselines` `app/api/update/route.ts:241–277`. Team derivation `app/(milb)/milb/player/[id]/page.tsx:184–185`; `player_season_stats` DDL `scripts/create-player-season-stats.sql:4–20`; `compete_pitches.pitcher_team` `scripts/create-compete-pitches.sql:63`; glossary `docs/VARIABLES.md:439`. Measured centrally 2026-08-12 in a single pass: `players` 16,931 rows / 1,632 kB; `team` 0% populated, `position` 10,899 (64.4%), `lahman_id` 3,228 (19.07%); 16,418 distinct names ⇒ 513 collisions; 553 non-ASCII rows; 16,474 `"Last, First"` vs 457 `"First Last"`; `pitches` ≈8,877,621 rows / 9,711 MB / 623,662 pages; `milb_pitches` ≈2,508,422 / 2,366 MB; `pitch_baselines` 206 rows, no timestamp; `last_analyze`/`last_autoanalyze` NULL everywhere. The ≈249,000-row rescore of 2026-08-11 carries from `metric-governance/02` §3.
