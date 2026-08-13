---
title: Record Linkage & Deduplication — Deciding When Two Rows Are the Same Person
domain: entity-resolution
tags:
  - record-linkage
  - fellegi-sunter
  - blocking
  - active-learning
  - precision-recall
  - splink
  - term-frequency
  - deduplication
sources_reviewed: 21
last_updated: 2026-08-12
---

# Record Linkage & Deduplication — Deciding When Two Rows Are the Same Person

## TL;DR

- **Triton has no deduplication problem inside `players`; it has an inbound linkage problem.** `players.id` *is* the MLBAM ID, so two rows cannot be the same person by construction. Every real ER cost sits where a source arrives without an MLBAM key. **(computed)**
- **513 of 16,418 distinct names are shared by two or more people, so ≥1,026 rows — 6.06% of `players` — are name-ambiguous.** `Gonzalez, Jose` alone is four men (114931, 467102, 681275, 683681). A name-only matcher has an irreducible error floor on exactly the rows it is most confident about. **(computed)**
- **Exact full-name agreement is worth ≈17.9 bits on average and ≈12.3 bits for "Gonzalez, Jose" — a 50× overstatement of the odds under one global `u`.** That gap is the whole argument for term-frequency-adjusted linkage. **(computed)**
- **Blocking, not the comparison model, sets the recall ceiling** — a dropped pair can never be matched at any threshold — yet Triton's only live linkage job needs none of it: 6 TrackMan pitchers × 16,931 players = 101,586 pairs, against 143,320,915 for `players` self-pairs and ≈338.6M for `players`×Lahman. **(established / computed)**
- **Where a shared key exists, probabilistic linkage is malpractice.** The Chadwick register supplies `key_mlbam` ↔ `key_bbref` ↔ `key_retro`; `scripts/import-lahman.ts:88–90` reads two of the three, then discards the table and keeps a dictionary in memory. **(computed)**
- **`players.lahman_id` at 19.07% is not a 19% match rate — the denominator is wrong.** Lahman covers MLB debutants; `players` holds every MLBAM ID in `pitches` *or* `milb_pitches` (2023+), so most of the 13,703 unlinked rows are structural non-matches. **(computed / estimated)**
- **Error costs are wildly asymmetric, so the threshold must be precision-first.** A false link silently merges two careers; a false non-link leaves an orphan, and `lib/dataIntegrity.ts:97–106` hunts orphans nightly. Optimize FDR, not F1. **(computed)**
- **Two writers store names in two formats, breaking every string comparator before it starts** — `app/api/update/route.ts:38–40` writes Savant's `"Last, First"`, `:52–53` writes MLB-API `fullName` raw as `"First Last"`: 16,474 vs 457 rows, plus 553 with diacritics. **(computed)**
- **Active learning buys labels, and labels are not the constraint here — ground truth already exists.** The register's key pairs are a free gold standard, worth more for *evaluating* a matcher than training one. **(established / estimated)**

---

## 1. Three problems that share a vocabulary

| Problem | Triton instance | Status |
|---|---|---|
| **Deduplication** — same entity twice in *one* table | `players` | **Absent by construction** — MLBAM ID is the PK (`11-id-schema-design.md`) |
| **Record linkage** — does a row in A correspond to one in B | Lahman/Retrosheet ↔ `players`; TrackMan ↔ `athlete_profiles` | **The real work** |
| **Canonicalization** — one entity, one representation | `players.name` in two formats, 553 accented | **Live defect** (§7.1) |

Conflating them produces the classic wrong move: a "dedupe the players table" project that finds 513 name collisions and merges people who were never the same. `Gonzalez, Jose` ×4 is not dirty data — it is four men, and the ID proving it is already the primary key.

The reverse discipline is already right: `app/api/update/milb/route.ts:437–440` inserts `'Unknown'` placeholders for unregistered MLBAM IDs and defers names to `checkUnknownPlayers` — identity first, attributes later. **(computed)**

---

## 2. Fellegi–Sunter in one page

Newcombe et al. (1959) proposed odds-based linkage; Fellegi & Sunter (1969) proved it optimal. For a candidate pair and a comparison vector **γ** over fields:

| Term | Definition | Reading |
|---|---|---|
| `m_i` | P(field *i* agrees \| **match**) | Data quality — typos, format drift, nicknames |
| `u_i` | P(field *i* agrees \| **non-match**) | Population coincidence — how common the value is |
| **Match weight** | `log₂(m_i/u_i)` on agreement, `log₂((1−m_i)/(1−u_i))` on disagreement | Bits of evidence, additive under conditional independence |
| **Score** | `λ = log₂(prior odds) + Σ w_i` | Posterior log-odds of a match |
| **Thresholds** | `λ > T_upper` link; `λ < T_lower` non-link; between → **clerical review** | Fix the two error rates and the thresholds follow |

Three properties to internalize. **(1) The three-way decision is the point** — F–S does not output a binary, and a system with no review queue has silently set `T_lower = T_upper`. **(2) Conditional independence is assumed and usually false** — first and last name both correlate with ethnicity and era, so agreements get double-counted and tail scores run overconfident. **(3) `m` and `u` are estimable without labels** via EM (Larsen & Rubin 2001), but EM on `u` is fragile: estimate `u` by random-pair sampling first, where the non-match assumption is nearly exact, and let EM move only `m`. **(established)**

---

## 3. `u` is where Triton's own data speaks

`u` for exact full-name agreement is measurable from the name distribution alone. With 16,931 rows over 16,418 distinct names, Σ(nᵢ−1) = 513, so Σnᵢ(nᵢ−1) ≥ 1,026 (equality iff every collision is a simple pair; the six four-way classes push it to ≈1,060).

```
u_name  ≈ 1,026 / (16,931 × 16,930) = 1,026 / 286,641,830 = 3.58 × 10⁻⁶
w_agree = log₂(m/u), m ≈ 0.90       → log₂(251,397) = 17.94 bits
```

Now condition on the value. A record named `Gonzalez, Jose` has three *other* records sharing it:

```
u_local ≈ 3 / 16,930 = 1.772 × 10⁻⁴ → log₂(0.90 / 1.772×10⁻⁴) = log₂(5,079) = 12.31 bits
```

**Δ = 5.63 bits = a factor of 49.5 in the odds.** A matcher using one global `u` treats agreement on `Gonzalez, Jose` as ~50× stronger evidence than it is — on the surnames that dominate Latin American baseball rosters, which is to say on Triton's population. Winkler's term-frequency adjustment (`term_frequency_adjustments` in Splink) replaces the global `u` with a per-value one and deletes the whole error class. **(computed; `m = 0.90` estimated — format drift and diacritics break exact agreement more often than a typo model suggests.)**

---

## 4. Blocking — where recall is actually lost

Blocking restricts comparison to pairs sharing a key. The two metrics are **reduction ratio** (pairs eliminated) and **pairs completeness** (true matches surviving). A true match dropped by blocking is unrecoverable at any threshold — the model never sees it.

### 4.1 The three candidate spaces, sized

| Linkage job | Left × Right | All-pairs | Verdict |
|---|---|---|---|
| `players` self-dedup | 16,931 × 16,930 / 2 | **143,320,915** | Don't run it — no duplicates exist (§1) |
| `players` × `lahman_people` | 16,931 × ~20,000 | **≈338,620,000** | Blocking mandatory *if* done probabilistically; unnecessary if keyed (§8) |
| TrackMan → `players` | 6 × 16,931 | **101,586** | No blocking needed; fits in a `SELECT` |

**(computed — packet row counts; Lahman ≈20k.)**

The third row is the punchline. Triton's only unsolved linkage job today is `compete_pitches`: **443 rows, 6 distinct `tm_pitcher_id`, 0 rows carrying `athlete_profile_id`** (`scripts/create-compete-pitches.sql:51,61`). Six people is not a blocking, EM, or tooling problem — it is a dropdown. Onboarding belongs to `08-facility-athlete-linking.md`; the point here is that **this machinery has a minimum viable scale and Triton is below it.**

### 4.2 Rule design

| Strategy | How | Reduction | Risk |
|---|---|---|---|
| Exact key | `birth_year` | ~1/60 | A missing/wrong year drops the pair |
| Composite | `surname_initial ‖ birth_year` | ~1/1,560 → ≈217k pairs on the Lahman job | Non-uniform: `G`+1994 is a huge block |
| Phonetic | `dmetaphone(surname)` | ~1/1,000s | Accent-sensitive unless normalized first (§7.1) |
| **Union of loose rules** | 3–5 cheap rules, OR the candidate sets | Avoids product-of-recalls | More pairs, far higher completeness |

**The union is the recommendation.** One clever rule fails on the records that are unusual in the way it assumes away; several loose rules fail on *disjoint* subsets, so pairs completeness approaches 1 while reduction stays within an order of magnitude of the best single rule. Splink's guidance and the Papadakis/Christen surveys converge here. **(established)**

Two Triton traps. Team-based keys are a temporal error — a mid-season trade yields two teams and one identity (`05-temporal-identity-changes.md`) — and worse, **`players.team` is populated on 0 of 16,931 rows**, so such a rule blocks everything to nothing, silently. **(computed)**

---

## 5. Precision, recall, and the asymmetry that sets the threshold

| Error | Mechanism | Triton consequence | Detectability |
|---|---|---|---|
| **False link** (precision loss) | Two Jose Gonzalezes merged | One leaderboard row holding two men's pitches; `stuff_plus` averaged over a chimera | **Invisible** — the row looks normal |
| **False non-link** (recall loss) | Accented name fails exact match | An orphan, a duplicate profile, missing history | **Visible** — `checkOrphanedPitchers` finds it |

Triton has an orphan detector and no chimera detector, so the error it can absorb is the one it can see. **Set thresholds for precision and push recall loss into a review queue.** F1 weights the two equally — a modelling assumption nobody here has endorsed.

The arithmetic settles it. A false-positive rate of just 10⁻⁵ per pair yields **1,433 false links** across the 143.3M self-pair space; 10⁻⁶ yields **≈339** across the 338.6M Lahman space. **(computed.)** With non-matches outnumbering matches ~10⁴:1, a 99.99%-specific classifier still produces more false links than true ones — the base-rate problem, and the reason blocking is a *precision* intervention as much as a cost one.

Evaluation discipline. **(1) Report precision, recall and review-band volume separately** — a single F1 hides which moved, and a threshold sending 4,000 pairs/week to a one-person team is a non-recommendation. **(2) Measure recall against a truth set built *before* blocking**, or you report the blocker's ceiling as the model's score. **(3) Hand link confidence to `Cas`, not the join**: `Cas/analytics-ux/02-null-zero-unknown-ui.md` owns the linked / probable / unresolved distinction, and a `LEFT JOIN` cannot carry it.

---

## 6. Active learning — and why the constraint is elsewhere

Sarawagi & Bhamidipaty's ALIAS and Bilenko & Mooney's learnable comparators established the core result: **uncertainty sampling reaches a given accuracy with roughly an order of magnitude fewer labeled pairs than random sampling**, because random pairs are almost all non-matches and carry nearly no information. `dedupe` productionizes this as a console labeler. **(established)**

| Pays when | Doesn't when |
|---|---|
| No shared key, ≥10⁴ entities, ongoing inflow | An authority file exists (Lahman/Retrosheet) |
| Labels cheap, labeler expert | The job is n=6 (TrackMan) |
| Comparator weights unknown | Ground truth exists — spend it on **evaluation** |

Triton sits in the right column three times over, and the 3,228 already-linked rows are a free gold standard. **Spend them on measuring, not training** — a labeled set used for training cannot also honestly report the model's error. Pipeline mechanics: `02-crosswalk-construction-maintenance.md`.

---

## 7. Tooling

| Tool | Model | Backend | Fit |
|---|---|---|---|
| **Splink** | F–S + EM, TF adjustments, blocking analysis | DuckDB / Spark / Postgres | **Best fit if linkage ever goes probabilistic** — SQL-native, runs on the DB you have |
| **dedupe** | Logistic + active learning | Python, in-memory | Good labeler; weaker at 10⁸ pairs |
| **fastLink** | F–S with EM | R, in-memory | Strong statistics, wrong language for this stack |
| **recordlinkage** / **Zingg** | Toolkit / ML + active learning | pandas / Spark | One-off analysis; Spark overweight for 16.9k rows |
| **Hand-rolled `pg_trgm`** | Similarity threshold | Postgres | What Triton has (`app/api/lahman/search/route.ts:15,30`; `app/api/chat/route.ts:367`) — fine for a **human-facing search box**, not an automated join |

### 7.1 Normalize before you compare, and know what it costs

Comparators are `03-name-matching-algorithms.md`; three facts belong here because they move `m` and `u` directly.

- **Format heterogeneity is a bug with a line number.** `app/api/update/route.ts:38–40` inserts pitchers from Savant's `player_name` (`"Last, First"`), `:52–53` inserts batters from the MLB People API's `fullName` verbatim (`"First Last"`), both through one upsert at `:60` — 16,474 vs 457 rows. Jaro–Winkler on the raw column measures *which writer inserted the row*. **(computed)**
- **`formatPlayerName` splits on the last space** (`lib/dataIntegrity.ts:18–23`), so a remediated `"Mel Rojas Jr."` becomes `"Jr., Mel Rojas"` — suffixes and compound Spanish surnames being exactly where Triton's collisions concentrate. **(computed)**
- **`unaccent` raises recall and lowers precision at once** — folding the 553 accented rows lets `Vázquez` match `Vazquez` *and* collapses distinct people. Fold for the *blocking* key, compare on the *original*. **(established / computed)**

---

## 8. What Triton should do, in order

1. **Persist the Chadwick register as a table** (`player_id_map`: `key_mlbam`, `key_bbref`, `key_retro`, `key_fangraphs`, `key_person`, names, `retrieved_at`). `scripts/import-lahman.ts:82–97` already downloads all 16 shards, then discards everything but a `bbref → mlbam` dictionary. One file, and linkage for two of the seven ID spaces disappears. Pin the upstream while there: `:17–18` pulls Lahman CSVs from an unpinned personal fork (`cbwinslow/baseballdatabank`) while the register comes from upstream — two provenance regimes for one crosswalk.
2. **Fix the denominator before reading the match rate.** Count `players` rows with ≥1 row in `pitches` — that, not 16,931, is the Lahman-linkable population. Log it to `docs/Queries.md`; until then 19.07% is uninterpretable.
3. **Build the evaluation set from the register's own keys** and measure what a name-only matcher *would* have done on the 3,228 known links. Publish confusion counts before writing a matcher.
4. **Fix the two name writers** — one normalizer at both insert sites, storing `name_first`/`name_last` and deriving the display string. Worth more than any comparator upgrade.
5. **Materialize a surname term-frequency table** for `u` (§3) — 16.9k rows, one query, reusable by `02`, `03` and `09`. Exclude sentinels, or TF adjustment scores the literal name `'Unknown'` (`lib/dataIntegrity.ts:52`) as the strongest match key you have.
6. **If probabilistic linkage is still needed after 1–5, use Splink** — union of 3–5 blocking rules, TF adjustments on, two thresholds, a review queue with a weekly volume cap.
7. **Add a match-rate regression assertion** on `lahman_id` coverage over the *linkable* subset. Alerting mechanics: `Jo/data-quality/06-reconciliation-source-of-truth.md`; the ratio's definition: `09-identity-quality-monitoring.md`.

**Anti-recommendation — do not build a fuzzy-name auto-linker (`similarity(...) > 0.85` writing an ID) to close the 81% of `players` with no `lahman_id`.** It is the obvious move and fails on three independent grounds. **(i) The population defeats it:** ≥6.06% of rows sit in a name-collision class, and agreement on a common surname is worth ~12.3 bits where the model credits ~17.9 — a 50× overstatement concentrated in the largest surname families in baseball. **(ii) The column defeats it:** with two name formats and 553 accented rows, trigram similarity is *anti-correlated* with identity — `"Rojas Jr., Mel"` vs `"Mel Rojas Jr."` scores low while `"Gonzalez, Jose"` vs `"Gonzalez, Jose"` scores 1.0 for two different men. **(iii) The premise defeats it:** most of that 81% is structural non-match, so the matcher would be tuned to force links that should not exist — and its false links are invisible, while the orphans it replaces were already caught nightly.

**Single highest-leverage next action:** run the register's key pairs against the 3,228 already-linked `players` rows and report three numbers — how many links a name-only match reproduces, how many it gets *wrong*, and how many of the 13,703 unlinked rows have a register entry at all. That turns "our crosswalk is 19% covered" into a measured precision/recall pair and decides items 5–6 without writing a matcher.

---

## Sources

1. Fellegi & Sunter (1969), [*A Theory for Record Linkage*](https://doi.org/10.1080/01621459.1969.10501049) — §2's `m`/`u` weights; the optimality proof for the two-threshold rule.
2. Newcombe et al. (1959), [*Automatic Linkage of Vital Records*](https://doi.org/10.1126/science.130.3381.954) — §2's odds framing; origin of frequency-based name weighting.
3. Wikipedia — [Record linkage](https://en.wikipedia.org/wiki/Record_linkage) — §1's deterministic-vs-probabilistic split.
4. Christen (2012), [*Data Matching*](https://doi.org/10.1007/978-3-642-31164-2) — §4's reduction-ratio / pairs-completeness pair; §5's discipline.
5. Christen (2012), [*Indexing Techniques for Record Linkage*](https://doi.org/10.1109/TKDE.2011.127) — §4.2's strategy table.
6. Papadakis et al. (2020), [*Blocking and Filtering for Entity Resolution*](https://doi.org/10.1145/3377455) — basis for §4.2's union-of-rules rule.
7. Elmagarmid et al. (2007), [*Duplicate Record Detection*](https://doi.org/10.1109/TKDE.2007.250581) — §1's dedup-vs-linkage separation.
8. Larsen & Rubin (2001), [*Iterative Automated Record Linkage Using Mixture Models*](https://doi.org/10.1198/016214501750332956) — §2's EM estimation and its fragility.
9. Wikipedia — [Expectation–maximization](https://en.wikipedia.org/wiki/Expectation%E2%80%93maximization_algorithm) — the mixture machinery §2 invokes.
10. Enamorado, Fifield & Imai (2019), [*Merging Large-Scale Administrative Records*](https://doi.org/10.1017/S0003055418000783) — scaled F–S reporting error rates honestly; §5's template.
11. [fastLink](https://github.com/kosukeimai/fastLink) — §7's R implementation.
12. [Splink docs](https://moj-analytical-services.github.io/splink/) — §7's primary tool: blocking analysis, `term_frequency_adjustments`, two-threshold API.
13. Robin Linacre — [Probabilistic record linkage: an introduction](https://www.robinlinacre.com/intro_to_probabilistic_linkage/) — the derivation behind §3's bit weights.
14. [dedupe](https://github.com/dedupeio/dedupe) / [docs](https://docs.dedupe.io/) — §6's active-learning labeler.
15. Sarawagi & Bhamidipaty (2002), [*Interactive Deduplication Using Active Learning*](https://doi.org/10.1145/775047.775087) — §6's label-efficiency claim.
16. Bilenko & Mooney (2003), [*Learnable String Similarity Measures*](https://doi.org/10.1145/956750.956759) — why comparator weights are learned, not hand-set.
17. [Zingg](https://github.com/zinggAI/zingg) and the [Python Record Linkage Toolkit](https://recordlinkage.readthedocs.io/) — §7's remaining tooling rows.
18. PostgreSQL — [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html), [`fuzzystrmatch`](https://www.postgresql.org/docs/current/fuzzystrmatch.html), [`unaccent`](https://www.postgresql.org/docs/current/unaccent.html) — the extensions §7 and §7.1 rely on.
19. [Chadwick Bureau register](https://github.com/chadwickbureau/register) — the authority file `import-lahman.ts` reads; supplies `key_mlbam`/`key_bbref`/`key_retro`.
20. [SABR — Lahman Database](https://sabr.org/lahman-database/) — canonical Lahman distribution now that `chadwickbureau/baseballdatabank` is deleted; §8 item 1's fork comparison (the fork Triton reads was last pushed 2022-10-31).
21. [pybaseball](https://github.com/jldbc/pybaseball) — `playerid_lookup`, the reference implementation of register-backed linkage.

**Triton-internal evidence.** Code read 2026-08-12; no database queried. Name writers: `app/api/update/route.ts:38–40` (pitchers, Savant `player_name`), `:52–53` (batters, MLB People API `fullName`, unformatted), `:60` (one upsert on `id`). MiLB placeholders: `app/api/update/milb/route.ts:437–440`. Formatting/integrity: `lib/dataIntegrity.ts:18–23` (`formatPlayerName` last-space split), `:48–53`, `:97–106`. Crosswalk: `scripts/import-lahman.ts:17–19` (fork + register URLs), `:82–97` (16-shard download → in-memory `bbrefToMlb`), `:104–106`, `:225–245`. Facility identity: `scripts/create-compete-pitches.sql:51,61`; `lib/compete/pitchSchema.ts:280–287` (`ctx.athlete_profile_id` optional, defaults null); `app/api/compete/performance/upload/route.ts:45` (`rowToDb` called without it — why 0 of 443 rows are linked). Fuzzy surfaces: `app/api/lahman/search/route.ts:15,30`, `app/api/chat/route.ts:367`, `app/api/game/search/route.ts:26,39`; Lahman ≈20k from `:148`. **Measured centrally 2026-08-12, quoted here:** `players` 16,931 rows (`CLAUDE.md`'s 4,017 is stale); `lahman_id` 3,228 (19.07%), `team` 0, `position` 10,899; 16,418 distinct names → 513 collisions, four-way classes incl. `Gonzalez, Jose` (114931, 467102, 681275, 683681); 16,474 `"Last, First"` vs 457 `"First Last"`; 553 non-ASCII; `compete_pitches` 443 rows / 6 `tm_pitcher_id` / 0 `athlete_profile_id`; orphan check Aug 2026 = 0. §4.1's pair counts and §3's bit weights are arithmetic on those totals, with `m = 0.90` assumed.
