---
title: Facility Athlete Linking — Who Threw This Pitch, and Can You Prove It
domain: entity-resolution
tags:
  - entity-resolution
  - facility-data
  - trackman
  - captury
  - whoop
  - athlete-profiles
  - amateur-identity
  - onboarding
sources_reviewed: 18
last_updated: 2026-08-12
---

# Facility Athlete Linking — Who Threw This Pitch, and Can You Prove It

## TL;DR

- **`compete_pitches.athlete_profile_id` is populated on 0 of 443 rows** — the column exists, is
  foreign-keyed and indexed, and has never held a value. **(computed)**
- **The cause is one omitted argument, not a hard matching problem:** `rowToDb` accepts
  `ctx.athlete_profile_id` and defaults it to `null`; the caller passes only `session_id` and
  `uploaded_by`. **(computed)**
- **Triton already links facility data correctly, twice** — Whoop at OAuth consent, Captury at a
  mandatory upload dropdown, both 100% by construction. The difference is **when** identity is
  bound, not how hard the match is. **(computed)**
- **Deferred linking is the expensive kind:** the cheapest evidence, the operator who knew who was
  on the mound, has a half-life of hours. **(established)**
- **Name-only linking to `players` is provably ambiguous:** 16,931 rows, 16,418 distinct names
  (**513 collisions**), two coexisting formats (16,474 `"Last, First"` vs 457 `"First Last"`), 553
  non-ASCII. Name is a blocking key, never a decision key. **(computed)**
- **`players` is the wrong target anyway** — a pitch-ingest byproduct, `team` on 0 rows;
  `athlete_profiles` is the registry. And `athlete_profiles.player_id`, where the ID spaces touch, is
  client-supplied on self-service POST and PUT with no DDL constraining it. **(computed)**
- **`tm_pitcher_id` is the right anchor and is already 100% present** (443/443, 6 distinct): link the
  *ID* six times, not the pitch 443 times — and **temporally**, since device IDs get reassigned.
  **(computed / estimated)**
- **The second TrackMan table has no linking affordance at all** — `trackman_pitches` has
  `tm_pitcher_id` but no `athlete_profile_id`, so fixing the CSV path fixes half the problem.
  **(computed)**
- **Zero repo hits for `consent`, `waiver`, `guardian`, or minors** — flagged here because
  onboarding is where it must land (detail: `10-privacy-pii-athlete-data.md`). **(computed)**

---

## 1. Three facility sources, three outcomes

| Source | Identity carrier | Bound where | Binding is | Link rate |
|---|---|---|---|---|
| **Whoop** | Whoop `user_id` | OAuth callback: `whoop_tokens.athlete_id ← athlete.id` | athlete-asserted, at consent | **100% by construction** |
| **Captury / C3D** | capture subject | upload form: `athlete_id` required; the column is `not null` | operator-asserted, at ingest | **100% by construction** |
| **TrackMan (CSV)** | `PitcherId` → `tm_pitcher_id` | nowhere | — | **0 / 443** |
| **TrackMan (webhook/FTP)** | `tm_pitcher_id` | no column exists | — | **structurally impossible** |

TrackMan is not harder. **Whoop and Captury made the link a precondition of the write; TrackMan made
it optional** — and an optional identity field collects nulls at the predictable rate.

Whoop's flow is strongest and least replicable: the athlete authenticates to the *source*, which
returns a subject identifier already bound to a consent grant (RFC 6749 §4.1) — no matching, no
adjudication. Anything a device emits without an athlete login is instead **a pseudonym you must
resolve**. Captury's is the replicable one: a dropdown enforced by a `not null` FK, hardened by an
SOP prescribing the subject name `<LastFirst>_<athlete_profile_id-short8>`.

---

## 2. Exactly how TrackMan came out at 0%

The plumbing is complete; the call site is not.

```ts
// lib/compete/pitchSchema.ts:280-287 — the parameter exists
export function rowToDb(row: PitchRow,
  ctx: { session_id: string; uploaded_by: string; athlete_profile_id?: string | null }
): DbPitchInsert {
  return { ..., athlete_profile_id: ctx.athlete_profile_id ?? null, ... }

// app/api/compete/performance/upload/route.ts:45 — the caller omits it
const db = rowToDb(r, { session_id: session.id, uploaded_by: user.id })
```

`create-compete-pitches.sql:51` declares the column, `:148` indexes it, and
`docs/compete-performance.md:59-63` calls the work deferred. Three consequences:

1. **`uploaded_by` is not the athlete** but the account that dropped the CSV, so RLS grants
   visibility on *upload provenance*, not subject identity.
2. **The UI groups by name:** the page builds its pitcher list from
   `new Set(rows.map(r => r.Pitcher))` and filters on `r.Pitcher === pitcher` (`page.tsx:165`,
   `:176`) — free text, not `tm_pitcher_id`. The platform's only per-athlete grouping of facility
   data uses the row's least reliable key.
3. **Session-over-session trending is impossible** — invisible at one session, a visible symptom at
   two.

The idempotency design is by contrast sound — `tm_pitch_uid` is `UNIQUE`, with a synthesized
fallback when `PitchUID` is absent: a sequencing decision, not an engineering deficit.

---

## 3. What to link *to*

### 3.1 `players` is a byproduct, not a registry

`players` is populated by the pitch ingest inserting whoever appears in `player_name`, plus a
season-stats backfill: **16,931 rows**, MLBAM IDs as PK (110001–842249), `lahman_id` on 19.07%,
`position` on 64.4%, **`team` on 0 rows**. It lists only people who have thrown a tracked pro pitch,
which a facility athlete usually has not. High-school, college, and independent-ball athletes have no
MLBAM ID at all; signed players *do*, assigned long before a debut, but are absent from **Triton's**
`players` because nothing has ingested a pitch for them. **A missing row in `players` is not evidence
the athlete lacks an MLBAM ID** — the likeliest amateur-linking error.

### 3.2 Name-only linking is provably ambiguous

| Hazard in `players` | Measured | Consequence for a facility name match |
|---|---|---|
| Duplicate names | 16,418 distinct / 16,931 rows → **513 collisions** | ~3% of exact-name matches return >1 candidate, no tiebreaker |
| Two name formats | 16,474 `"Last, First"` vs 457 `"First Last"` | TrackMan emits `"Last, First"`; a naive equality join silently misses the 457 |
| Non-ASCII names | **553** | `José`/`Jose`, `Peña`/`Pena` fail equality; needs NFD + `unaccent` |
| No `team` | 0 rows populated | the most natural disambiguator does not exist |

Exact name equality is a *blocking* step — it produces candidates — never a decision step.
Fellegi–Sunter split candidate generation from adjudication for this reason; every practical toolkit
since preserves it.

### 3.3 The unguarded bridge: `athlete_profiles.player_id`

The single point where the facility ID space meets MLBAM. It is written from request bodies on create
and update (`compete/profile/route.ts:58`, `:106`), self-service creation is allowed
(`targetProfileId === user.id`), and downstream it is trusted — the mechanics report route joins
`players.name` on it for display. There is **no
`create table public.athlete_profiles` in `scripts/`**, only FK references, so no guarding constraint
is verifiable from the repo. This is a **survivorship** problem, not a validation problem
(`07-master-data-management-patterns.md`): a claimed MLBAM ID from a self-serve form and a verified
one from an operator match are different-confidence assertions in the same column. Record the
assertion *and its source*, or the golden record inherits the weakest input.

---

## 4. The anchor: link the ID once, temporally

`tm_pitcher_id` is present on **443/443** rows with **6** distinct values, matching the 6 distinct
`pitcher_name` values exactly. The unit of linkage is **6 decisions, not 443**.

A facility TrackMan unit assigns pitcher IDs from its own roster database; those get re-keyed on
migration, re-used when a roster is rebuilt, and sometimes misattached and corrected later. A
denormalized column records the *conclusion* and destroys the *basis*; a mapping
table makes a correction a new row, not an untraceable rewrite — the argument for baseline vintages
in `metric-governance/02-metric-versioning-reproducibility.md`.

```sql
create table public.facility_athlete_ids (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null,          -- trackman | captury | whoop
  external_id        text not null,          -- tm_pitcher_id, Captury subject, …
  external_name      text,                   -- as the device emitted it, for audit
  athlete_profile_id uuid not null references public.athlete_profiles(id) on delete cascade,
  match_method       text not null check (match_method in
                       ('operator_confirmed','oauth','self_claimed','probabilistic')),
  match_confidence   double precision,       -- null for deterministic methods
  matched_by         uuid references public.profiles(id),
  valid_from         date not null default current_date,
  valid_to           date                    -- null = current
);
create unique index on public.facility_athlete_ids (source, external_id) where valid_to is null;
```

Keep `compete_pitches.athlete_profile_id` as the **denormalized read path** — already indexed — but
make the map the source of truth and fill the column *from* it at ingest. `trackman_pitches` has no
such column, so the webhook/FTP path cannot be fixed by a route change alone.

---

## 5. Bind at ingest; resolve only at the margin

The rule: **the athlete must be named by a human who knows, at the moment the data is written.**

1. **On CSV parse (client), extract distinct `(PitcherId, Pitcher)` pairs** — 6 for the sample file,
   typically <15 per session. The whole identity problem, surfaced pre-upload.
2. **Look each up in `facility_athlete_ids`.** Known IDs resolve silently — the steady state.
3. **For unknown IDs, block the upload on a resolution step:** an `athlete_profiles` picker, a
   **create athlete** action, or an explicit **not an athlete we track** (opposing hitters, guest
   arms), tombstoned so it is not re-asked.
4. **Write the map, then the pitches**, filling `athlete_profile_id` from `rowToDb`'s existing `ctx`.
   That ordering is load-bearing: `reliability-findings-2026-08-11.md` #12h documents the MLB ingest
   writing pitches *before* the players they reference, making a FK there destructive.

### 5.1 Why "just do it later" loses

| Cost | At ingest | Retroactively |
|---|---|---|
| Who knows | the operator standing there | nobody; reconstruct from names and dates |
| Effort | ~6 clicks per new athlete, once | build a matcher, review, adjudicate |
| Accuracy | deterministic, human-confirmed | probabilistic, with a false-match rate to measure |
| Failure mode | upload blocked (loud) | wrong athlete's merged in (silent) |

The last row decides it. A **false match is unrecoverable** — two athletes merged under one profile
produce a metric wrong in a way no downstream check detects, since row counts and distributions stay
plausible. A **false non-match is merely incomplete**, fixable any time. Tune every threshold for
precision over recall.

### 5.2 Amateur athletes: what identity even means

With no external authority, `athlete_profiles.id` **is** the canonical identity — a Triton-owned UUID
surrogate key (RFC 4122) with no source-system semantics. The schema already does this.

- **Never key an athlete on an external ID.** `tm_pitcher_id`, a Whoop `user_id`, a Perfect Game or
  NCAA profile — attributes with a source, all mutable, all optional.
- **`player_id` is nullable and must stay nullable.** Any path assuming it is present is a bug for
  most facility athletes; amateur registries are enrichment, never the join.
- **Level transitions are the interesting event.** An athlete who signs acquires an MLBAM ID
  mid-relationship: `player_id` going non-null on an *existing* profile — never a new profile, never
  a merge (`05-temporal-identity-changes.md`).

---

## 6. If you must resolve retroactively

**The 443 rows on disk are a special case:** 6 distinct IDs, one date, an uploader who can still be
asked — a six-question interview, not a linkage problem. Do it manually, record
`match_method = 'operator_confirmed'`, and do not defer again; this is the last cheap moment.

| Stage | Tool | Watch out |
|---|---|---|
| Normalize | NFD + `unaccent`, case-fold, strip Jr/III, split `"Last, First"` | never overwrite the raw string |
| Block | `pg_trgm`, `dmetaphone`, plus DOB/level/date window | a wrong blocking key loses the true match permanently |
| Compare | Jaro–Winkler / Levenshtein, plus handedness, birth year, team | name-only agreement is near-worthless at this collision rate |
| Adjudicate | Fellegi–Sunter weights (Splink, fastLink) *or* a human queue | an uncalibrated m/u probability is a guess with a decimal point |

For six IDs this stack is absurd; it becomes right at ~hundreds of unresolved records, where a
facility lands after a season of unbound ingest. **The stack exists to justify never needing it**
(`03-name-matching-algorithms.md` owns the detail).

---

## 7. Consent, and monitoring the link rate

Onboarding is the only moment consent can be captured, so the *hook* belongs here though the
substance does not — **`10-privacy-pii-athlete-data.md` owns retention, minors, biometrics, and legal
basis.** Scoped to linkage: a repo-wide grep for `consent`, `waiver`, `guardian`, and minor-athlete
handling returns **no governance hits**. Whoop is the only source where consent and identity are the
same act; Captury and TrackMan bind by *operator assertion*, which the athlete never sees — and
Captury ingests markerless full-body kinematics. The linkage-side minimum: a consent state on
`athlete_profiles` that §5's resolution step refuses to bind an external ID without. Deletion also
constrains the design: `compete_pitches.athlete_profile_id` is `on delete set null` while
`biomech_captures.athlete_profile_id` is `on delete cascade`, so one deletion request *anonymizes*
TrackMan data and *destroys* biomech data.

Identity failure is silent — every row present, every value plausible, only the grouping wrong — so
it needs explicit assertions:

| Check | Definition | Threshold |
|---|---|---|
| **Unlinked rate** | `count(*) filter (athlete_profile_id is null) / count(*)`, per session | any new session >0% is a defect |
| **Unmapped IDs** | `tm_pitcher_id` with no current `facility_athlete_ids` row | alert on first occurrence |
| **Ambiguous map** | one `external_id` with >1 `valid_to is null` row | the index prevents it; assert anyway |
| **Duplicate person** | two `athlete_profiles` with the same `player_id`, or name+DOB | manual review queue |
| **Low confidence** | `match_method = 'probabilistic'`, `match_confidence < 0.95` | review queue, never auto-accepted |

These belong beside `lib/dataIntegrity.ts`, which already runs `checkOrphanedPitchers` /
`checkOrphanedBatters` nightly — as of Aug 2026, **0 orphans** across 453 MLB pitchers and 444 MiLB
batters. The machinery works; it was never pointed at the facility tables. Copy it over, avoiding the
known defect: both checks carry `LIMIT 200`, so `found` saturates. **Jo owns the alerting**;
`09-identity-quality-monitoring.md` carries the assertion design.

---

## 8. What Triton should do, in order

1. **Resolve the 6 existing `tm_pitcher_id` values by hand, today** — six questions to the uploader.
2. **Ship `facility_athlete_ids`** with the temporal unique index, seeded with those six.
3. **Add the resolution step to the upload flow** (§5): distinct `(PitcherId, Pitcher)` pairs
   surfaced pre-upload, picker / create / not-tracked.
4. **Pass `athlete_profile_id` in `rowToDb`'s `ctx`** at `upload/route.ts:45` — one line; the
   parameter already exists.
5. **Backfill the 443 rows**, then assert `athlete_profile_id is null` returns nothing.
6. **Add `athlete_profile_id` to `trackman_pitches`** and wire the same resolution into the
   webhook/FTP path, or that ingest regenerates the problem at scale.
7. **Group the performance page by `tm_pitcher_id`, displaying the name** — the string stops being
   a key.
8. **Constrain `athlete_profiles.player_id`:** real DDL in `scripts/`, FK to `players(id)`, record
   who asserted it, stop writing it from an unverified client body.
9. **Add the five link-rate checks** (§7) without the `LIMIT 200` bug, plus a consent gate once
   `10-privacy-pii-athlete-data.md` lands.

**Anti-recommendation — do not write a name-matching backfill linking `compete_pitches` to `players`
by `pitcher_name`.** Wrong on three independent grounds. **(i) The target is wrong:** `players` is a
pro-pitch byproduct, so an athlete who has never thrown a tracked pro pitch cannot be in it — the
matcher's *best possible* outcome for most facility athletes is a false match. **(ii) The key is
wrong:** 513 duplicate names, two formats, 553 non-ASCII names, and `team` on 0 rows means the
disambiguator does not exist; the matcher cannot be made correct, only quiet. **(iii) The economics
are inverted:** six IDs need six questions; a matcher is days of work for a *lower*-confidence answer
whose false matches are unrecoverable and whose false non-matches were free to fix by hand.
The softer "link now, clean up later" dies with it.

**Single highest-leverage next action:** ask the uploader of the 2026-04-13 session to name the six
`tm_pitcher_id` values and write them into `facility_athlete_ids` as `operator_confirmed`. That one
step converts the platform's only 100%-unlinked table into a solved case and makes everything above
an incremental change, not a migration.

---

## Sources

1. [Chadwick Bureau register](https://github.com/chadwickbureau/register) — the MLBAM↔Retrosheet↔Lahman crosswalk: the register a facility athlete has *no* row in.
2. [pybaseball](https://github.com/jldbc/pybaseball) — `playerid_lookup`, a Chadwick-backed name→ID resolver: the model for §5.2.
3. [Lahman Database (SABR)](https://sabr.org/lahman-database/) — source of the `lahman_id` on 19.07% of `players`: how partial a crosswalk stays.
4. [MLB Prospects](https://www.mlb.com/prospects) — MLBAM IDs exist for signed amateurs pre-debut: absence from `players` is not absence of an ID.
5. [Perfect Game](https://www.perfectgame.org/) — amateur registry with its own identifiers: a candidate `source`, never a join key.
6. [Fellegi & Sunter (1969), *A Theory for Record Linkage*](https://www.tandfonline.com/doi/abs/10.1080/01621459.1969.10501049) — the m/u framework and the candidate-vs-decision split (§3.2).
7. [Winkler, *Record Linkage and Current Research Directions* (Census, 2006)](https://www.census.gov/library/working-papers/2006/adrm/rrs2006-02.html) — blocking and error rates; §5.1's precision-over-recall stance.
8. [Christen, *Data Matching* (Springer, 2012)](https://link.springer.com/book/10.1007/978-3-642-31164-2) — the comparison-function taxonomy behind §6's table.
9. [Splink](https://moj-analytical-services.github.io/splink/) — production Fellegi–Sunter with calibration diagnostics, at §6's scale only.
10. [fastLink](https://github.com/kosukeimai/fastLink) — EM-based linkage; §6's calibrate-on-labelled-pairs rule.
11. [PostgreSQL `pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html) — trigram similarity and GIN indexing: §6's blocking primitive, already there.
12. [PostgreSQL `fuzzystrmatch`](https://www.postgresql.org/docs/current/fuzzystrmatch.html) — Levenshtein, Soundex, `dmetaphone`: §6's comparators.
13. [PostgreSQL `unaccent`](https://www.postgresql.org/docs/current/unaccent.html) — the accent-folding step the 553 non-ASCII names need.
14. [Unicode UAX #15](https://unicode.org/reports/tr15/) — why `unaccent` must follow NFD: identical-looking names can differ in bytes.
15. [W3C, *Personal names around the world*](https://www.w3.org/International/questions/qa-personal-names) — first/last is not universal: §3.2's format hazard is structural.
16. [RFC 4122 — UUID](https://datatracker.ietf.org/doc/html/rfc4122) — the surrogate-key standard `athlete_profiles.id` follows (§5.2).
17. [RFC 6749 — OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) — §4.1's flow makes the Whoop binding athlete-asserted.
18. [WHOOP for Developers](https://developer.whoop.com/) — the `user_id` and token model in `whoop_tokens`: consent-time binding done right.

**Triton-internal evidence.** Every `(computed)` claim resolves to repo source or the 2026-08-12
central measurement pass; **no production query was run for this doc.** *Unlinked column:*
`create-compete-pitches.sql:51,148,54`; `lib/compete/pitchSchema.ts:280-287`;
`app/api/compete/performance/upload/route.ts:45` (omitted arg), `:50-54`;
`docs/compete-performance.md:59-63`. *Name grouping:*
`app/(compete)/compete/performance/page.tsx:165`, `:176`. *Working link paths:*
`app/api/compete/whoop/callback/route.ts:45-52`; `lib/compete/whoop.ts:255,275,297`;
`scripts/enable-rls.sql:36-47`; `app/api/mechanics/upload/route.ts:22,33-43,60`;
`scripts/create-biomech-captures.sql:18,40,87-93`; `docs/mechanics-capture-sop.md:246-258`.
*Second TrackMan space:* `scripts/create-trackman-schema.sql:29-127` (`tm_pitcher_id` at `:45`, no
`athlete_profile_id`). *Unguarded bridge:* `app/api/compete/profile/route.ts:58,106`;
`app/api/mechanics/report/route.ts:37-42`; `app/(compete)/compete/page.tsx:349-351`; a
`scripts/*.sql` grep returns only FK references, no `create table`. *Consent:* a repo-wide grep for
`consent|waiver|minor|guardian` returns no governance hits. *Monitoring:*
`lib/dataIntegrity.ts:97,156`; `docs/reliability-findings-2026-08-11.md:387`, `:355-375`. **Measured centrally 2026-08-12:** `compete_pitches` 443 rows, 6 distinct `pitcher_name`,
6 distinct `tm_pitcher_id`, 443 with `tm_pitcher_id`, **0 with `athlete_profile_id`**, all on one
`pitch_date` of 2026-04-13; `players` 16,931 rows, ids 110001–842249, `lahman_id` 3,228 (19.07%),
`position` 10,899 (64.4%), `team` 0, 16,418 distinct names (**513 collisions**), 16,474
`"Last, First"` / 457 `"First Last"`, 553 non-ASCII; Aug 2026 orphan check 0 across 453 MLB pitchers
and 444 MiLB batters. `CLAUDE.md`'s "4,017 players" is stale by 4×.
