---
title: Name Matching Algorithms — When a String Is and Isn't a Person
domain: entity-resolution
tags:
  - name-matching
  - jaro-winkler
  - phonetic-encoding
  - unicode-normalization
  - transliteration
  - spanish-naming
  - pg-trgm
  - identity
sources_reviewed: 20
last_updated: 2026-08-12
---

# Name Matching Algorithms — When a String Is and Isn't a Person

## TL;DR

- **Name matching is a fallback, and Triton's one good crosswalk never compares a string** —
  `import-lahman.ts` joins `key_bbref → key_mlbam` from the Chadwick register. **(computed — `import-lahman.ts:84–97`)**
- **`players.name` is not a key and no metric can make it one.** 16,931 rows, 16,418 distinct names — 513
  excess, so **684–1,026 rows** collide, and `Gonzalez, Jose` is **four** MLBAM IDs at similarity **1.000**. **(computed)**
- **Two name formats coexist in one column because one function has two writers** — Savant's
  `player_name` (`"Last, First"`) for pitchers, MLB People's `fullName` for batters: 16,474 vs **457**
  rows. **(computed — `app/api/update/route.ts:21, 40, 53`)**
- **`pg_trgm` is the only fuzzy primitive installed** — no `unaccent`, no `fuzzystrmatch` — and accents
  cost recall: `vazquez`/`vázquez` share 5 of 11 trigrams = **0.4545** (above the 0.3 default), while `=`
  returns zero on all **553** accented rows. **(computed — `docs/Queries.md:1128`)**
- **Normalization decides more matches than the metric does** — case, accents, punctuation, suffixes and
  name order are deterministic; similarity is only a guess about what is left. **(established)**
- **`formatName` treats the last whitespace token as the surname**, writing **"Jr., Vladimir Guerrero"**
  into `milb_pitches.player_name`. **(computed — `app/api/update/milb/route.ts:310–316`)**
- **Soundex fails on exactly this roster**: it preserves the first letter, so `Carlos`→C642 vs
  `Karlos`→K642 and `César`→C260 vs `Sesar`→S260 never match. **(established)**
- **Under Spanish convention "both strings are correct" is the common case** — block on paternal surname +
  given name + birth year, never the display string. **(established)**
- **The real defect is that `players` carries nothing to disambiguate with** — `team` on **0%** of rows,
  `position` on 64.4%, no birth date. A four-way collision has no tiebreaker at all. **(computed)**

---

## 1. Ask first whether you need a string comparison

| Tier | Method | Triton example |
|---|---|---|
| 1 | **Shared identifier** | `pitches.pitcher` → `players.id`, both MLBAM — **0 orphans** Aug 2026 |
| 2 | **Published crosswalk** | Chadwick `people-*.csv` (`import-lahman.ts:85–96`) |
| 3 | **Deterministic composite** | normalized surname + given name + birth date |
| 4 | **Probabilistic linkage** | Fellegi–Sunter → `04-record-linkage-deduplication.md` |
| 5 | **Name similarity alone** | free-text `Pitcher` in a TrackMan CSV |

**Every tier below 2 is a tax paid because someone upstream did not publish a key.** Triton is at tier 1 for
pitch data and tier 2 for Lahman — solved, not to be re-litigated with fuzzy matching
(`02-crosswalk-construction-maintenance.md`) — and at **tier 5** for facility data, where all 443
`compete_pitches` rows carry `tm_pitcher_id` and **0** carry `athlete_profile_id`. **(computed)**

---

## 2. Normalization — the part that moves the numbers

Run in order. Each step is deterministic; none of them guesses.

| Step | Transform | Why it precedes similarity | Triton exposure |
|---|---|---|---|
| 1 | **Unicode NFC/NFKC** | `é` as one codepoint vs `e`+U+0301 are different strings | 553 accented rows |
| 2 | **Case folding** | `LOWER()` is locale-dependent (Turkish dotless ı) | every route uses `LOWER()` |
| 3 | **Diacritic stripping** | turns a fuzzy problem into an exact one | **no `unaccent`** |
| 4 | **Punctuation / spacing** | `C.J.`/`CJ`, `O'Neill`/`ONeill`, `de la Cruz`/`Delacruz` | `C.J. Hinojosa` |
| 5 | **Suffix extraction** | `Jr.`/`Sr.`/`II`/`III` are not surnames | `formatName` gets this wrong |
| 6 | **Name-order canonicalization** | `"Last, First"` vs `"First Last"` | 16,474 vs 457 rows |
| 7 | **Particle policy** (`de`, `del`, `van`) | index/sort rules differ by country | Latin American, Dutch |

Steps 1–4 are stable enough to **store**: a generated `name_norm` column with a GIN trigram index, not a
per-route expression. Postgres will not index `unaccent(name)` directly — the packaged function is not
`IMMUTABLE` — so wrap it or store the result. Skipping step 3 costs real rows: `Vazquez` never finds
`Vázquez, Christian` under `=` or `LIKE`, and that row is *also* a four-way collision. **Normalization
fixes recall; `birth_date` fixes precision.**

---

## 3. String similarity — pick per field, not per system

| Metric | Good at | Characteristic failure | Verdict |
|---|---|---|---|
| **Levenshtein** (+Damerau) | typos, transpositions | length-blind: distance 2 is fatal on `Ng`, trivial on `Encarnación` | normalize by length |
| **Jaro–Winkler** | **surnames** — rewards common prefix | over-rewards prefixes (`Martinez`/`Martin`) | **default for a surname field** |
| **Trigram (pg_trgm)** | substring recall, typeahead | length-sensitive: short query vs long target is capped | **the only one installed** — search yes, joins no |

### 3.1 Worked: `Gonzalez` vs `Gonzales`

Match window = ⌊8/2⌋−1 = 3; the first seven characters match in place, the final `Z`/`S` finds no partner
in window, so m = 7, t = 0:

```
Jaro = (1/3)(7/8 + 7/8 + 7/7) = 0.91667
JW   = 0.91667 + min(4,ℓ)·0.1·(1 − 0.91667) = 0.9500   (Levenshtein 1 → 0.8750)
```

**0.95 clears any conventional auto-merge threshold — and here the merge would be wrong**, because
`Gonzalez, Jose` alone is four people. *(established for the algorithms; computed for the collision.)*

### 3.2 Worked: pg_trgm, by its documented definition

pg_trgm pads each word with two leading and one trailing space, then counts shared/union:

```
gonzalez → {"  g"," go",gon,onz,nza,zal,ale,lez,"ez "}  (9)
gonzales → {"  g"," go",gon,onz,nza,zal,ale,les,"es "}  (9)
shared 7, union 11 → 0.6364   (% at default 0.3 → true)

vazquez  → {"  v"," va",vaz,azq,zqu,que,uez,"ez "}      (8)
vázquez  → {"  v"," vá",váz,ázq,zqu,que,uez,"ez "}      (8)
shared 5, union 11 → 0.4545   (still above 0.3)
```

*(established — pg_trgm's documented algorithm; arithmetic by hand, not queried.)*

**Length sensitivity is the trap.** A surname-only query against a `"Last, First"` concatenation is bounded
above by |query trigrams| / |target trigrams| — `ohtani` vs `ohtani, shohei` = 7/14 = **0.50** — so
`similarity` ordering prefers **short first names**. Triton's Lahman search is partly saved by sorting on
`match_rank` first, but `%` is still the recall gate at the loose 0.3 default.
**(computed — `app/api/lahman/search/route.ts:24–41`)**

---

## 4. Phonetic encoding — and why it is the wrong tool here

| Algorithm | Language model | Failure that matters here |
|---|---|---|
| **Soundex** | 1918, English | **first letter never encoded phonetically** — C/K, S/Z, silent H all break |
| **Metaphone** | 1990, English | one code — cannot hold two pronunciations |
| **Double Metaphone** | 2000, multi-language | **primary + alternate** codes, Spanish/Germanic/Slavic rules — the only reasonable option here |

Soundex's first-letter rule is disqualifying for a Latin-American roster: `Carlos`→**C642** vs
`Karlos`→**K642**, `César`→**C260** vs `Sesar`→**S260** — identical sound, no match — while its famous false
positives (`Robert`/`Rupert` → **R163**) are the mirror failure. `Gonzalez`/`Gonzales` both encode **G524**,
which Jaro–Winkler already caught at 0.95 without asserting a pronunciation. **(established — hand-encoded
from the published rules.)** **Li's position: phonetic codes are a *blocking* key, never a scoring signal**
— candidates from Double Metaphone, scored by Jaro–Winkler plus an attribute check. Used as the decision, a
phonetic code imports an unstated language assumption.

---

## 5. Accents, transliteration, and name order across scripts

| Case | Variants in baseball sources | Handling |
|---|---|---|
| **Spanish diacritics** | `Vázquez`/`Vazquez`, `Peña`/`Pena` | fold for matching, **preserve accents for display** — display is **Cas**'s call; note folding `ñ`→`n` is right for matching, wrong for pronunciation |
| **Romanization** | `Ohtani`/`Ōtani`/`Otani`; `Ha-Seong`/`Haseong` | fold macrons, add an `oh`↔`ō`↔`o` rule, strip hyphens in given names |
| **East Asian name order** | MLBAM Western; NPB/KBO family-first | canonicalize **per source**, never by heuristic |

Statcast carries diacritics — the 553 accented rows prove it *(computed)* — while ASCII-era sources do not.
**Falsifiable prediction:** `lahman_people.name_last ~ '[^\x20-\x7E]'` matches **0** rows, making
accent-folding the single biggest lever on Lahman↔MLBAM match rate. *(estimated)*

---

## 6. Suffixes, initials, and nicknames

**Suffixes are not surnames, and the MiLB ingest thinks they are:**

```ts
// app/api/update/milb/route.ts:310-316
const parts = fullName.split(' ')
if (parts.length > 1) return `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`
```

`"Vladimir Guerrero Jr."` → `"Jr., Vladimir Guerrero"`; every generational suffix in the feed is mis-parsed
identically, and `Mel Rojas Jr.` already sits in `players`. **(computed)** Correct order: extract suffix →
extract particles → the remainder's last token is the paternal surname. `retro_people` models this with a
`name_suffix` column (`scripts/create-retro-tables.sql:27`); `players` does not.

| Pattern | Example | Rule |
|---|---|---|
| **Generational suffix** | `Jr.`, `III` | separate field; **never** a match-blocker alone |
| **Punctuated initials** | `C.J. Hinojosa` | strip periods and internal spaces: `C.J.`→`cj` |
| **Nickname ↔ legal** | `Nick`/`Nicholas`, `Chipper`/`Larry` | needs a **dictionary**; no distance metric recovers it |

`Jr.` is the highest-risk false-merge shape in the sport: a high Jaro–Winkler score on a father/son pair is
**right about the string and wrong about the person**, and only a birth date separates them.

---

## 7. Latin American naming conventions

Spanish custom gives two surnames — **apellido paterno + apellido materno** (`José Ramírez Peña`). US
sources usually publish the paternal one only — but not always, and not consistently across sources or
across a career.

| Failure mode | Shape | Consequence | Rule |
|---|---|---|---|
| Maternal surname dropped | `Ramírez Peña` vs `Ramírez` | trigram similarity collapses — an extra word in the union | **block on the paternal surname** |
| Both kept, unhyphenated | `Hernández Pérez, Carlos` | last-token parsing takes `Pérez` as the surname | parse from the **left**, or use structured fields |
| Compound paternal surname | `de la Cruz`, `del Río` | particle-splitting yields `Cruz`/`Río` | particle whitelist, before tokenizing |
| Accent in one source only | `Peña`/`Pena` | exact fails, trigram drops to ~0.45 | fold (§2 step 3) |

**Token-set comparison is the right instrument.** Compare the *set* of normalized surname tokens with
Jaccard or a best-pair Jaro–Winkler, so `{ramirez}` ⊂ `{ramirez, pena}` reads as agreement, not a 50%
penalty; edit distance on the concatenation cannot, because the difference is a whole token. Every rule is
per-source and per-era — Brazilian ordering is the **reverse** of Spanish — so it belongs in a documented
crosswalk with provenance, not a `LIKE` inside a route.

---

## 8. Where Triton matches names today, and the threshold asymmetry

| Surface | `file:line` | Mechanism | Risk |
|---|---|---|---|
| `syncNewPlayers` → `players` | `app/api/update/route.ts:21, 40, 50–53` | ID-keyed; Savant name for pitchers, `fullName` for batters | none for identity; **the 457-row format split** |
| MiLB placeholders | `app/api/update/milb/route.ts:437–441` | inserts literal `name: 'Unknown'` | many people, one name — a **dedup magnet** |
| MiLB `player_name` | `app/api/update/milb/route.ts:226, 310–316` | last-token surname | **suffix corruption** |
| `search_players` family | not in repo; `fix-security-advisories.sql:203–204` | `pg_trgm` `%`, `similarity()` | logic lives **only in the DB** |
| Lahman search (+ its **duplicate** at `chat/route.ts:367`) | `app/api/lahman/search/route.ts:17–42` | `%`, `similarity()`, three `LIKE` branches | leading-wildcard `LIKE`; loose 0.3 gate; two copies drift |
| TrackMan ingest | `lib/compete/pitchSchema.ts:293–294` | free-text `Pitcher` + `tm_pitcher_id` | 443/443 unlinked |
| Lahman crosswalk | `scripts/import-lahman.ts:84–97, 223–244` | **`key_bbref` → `key_mlbam`** | the correct pattern |

Eight surfaces, no shared normalization function. Staleness is **Jo**'s question, labelling a fuzzy hit as
approximate on screen is **Cas**'s, and whether a *metric* should rest on a fuzzy-matched population is
**Soto**'s. Li's is whether the match is defensible — and no surface records *why* it matched.

A threshold's costs **invert** with the consumer. Typeahead search should be loose — a false negative makes
a player unfindable, a false positive is ignored. An analytical join must be strict — one false positive
fuses two people and corrupts every number downstream. An automated merge should not exist. Triton's single
threshold (pg_trgm's 0.3 via `%`) sits on a *search* surface, which is right; the danger is copying that
operator into a join, where a search-appropriate threshold silently becomes an identity decision.
`retro_id_map_conflicts` (`create-retro-tables.sql:244–256`) is the right shape for the never-automatic
case. Calibrated scoring and blocking belong to `04-record-linkage-deduplication.md`, temporal identity to
`05-temporal-identity-changes.md`, key design to `11-id-schema-design.md`.

---

## 9. What Triton should do, in order

1. **Give `players` something to disambiguate with.** Add `birth_date`, `name_first`, `name_last`,
   `name_suffix`, `name_use` from the Chadwick shards `import-lahman.ts:85–96` already downloads — the
   513-collision table becomes resolvable, with no new dependency.
2. **Install `unaccent` and `fuzzystrmatch`**, and add a stored `name_norm` (NFC → casefold → unaccent →
   strip punctuation → drop suffix) with a GIN trigram index — one normalizer for every surface, fixing all
   553 accented rows deterministically.
3. **Fix `formatName`** — extract the suffix before choosing a surname, then backfill
   `milb_pitches.player_name`. A one-line parser bug is corrupting the corpus.
4. **Make the two `players` writers agree** and backfill the 457 `"First Last"` rows — better, stop storing
   a formatted display name at all once (1) lands.
5. **Replace `'Unknown'` placeholders with `NULL`** — a sentinel shared by many people survives a
   `GROUP BY name`; an absent value does not.
6. **Move the `search_players` bodies into `scripts/`** and fold the duplicated Lahman SQL
   (`lahman/search/route.ts:17–42`, `chat/route.ts:367`) into one function tiebreaking on Jaro–Winkler over
   `name_last`, not length-biased `similarity()`. Matching logic living only in the database is unversioned
   and unreviewable — the same defect as an undocumented metric.
7. **Route every fuzzy candidate to a `retro_id_map_conflicts`-style review table. Never auto-merge.**

**Anti-recommendation — do not "fix search" by adding a fuzzy name-match fallback to `search_players`.**
It is the obvious response to "I typed Vazquez and got nothing," and it is wrong three ways.
(i) **The failure is normalization, not similarity**: `unaccent` + `name_norm` recovers all 553 accented
rows *exactly*, with zero new ambiguity, while a threshold buys the same recall by spending precision on a
table that already holds 513 collisions. (ii) **The result is unadjudicable**: with `team` at 0%, `position`
at 64.4% and no birth date, neither the UI nor the user can tell which `Gonzalez, Jose` came back — a fuzzy
hit with no tiebreaker is a coin flip wearing a relevance score. (iii) **The operator gets reused as a
join**, where the error costs invert (§8). Ship structured attributes first and fuzzy search becomes a
nicety rather than the only thing holding identity together.

**Single highest-leverage next action:** run step 1's register-backed backfill and report how many of the
513 collisions resolve to distinct birth dates. That number decides whether Triton needs probabilistic
linkage at all, or just a better key.

---

## Sources

1. [Chadwick Bureau register](https://github.com/chadwickbureau/register) — the `people-*.csv` shards `import-lahman.ts` fetches; source of `key_mlbam`/`key_bbref` and the birth dates step 1 needs.
2. [SABR — Lahman Database](https://sabr.org/lahman-database/) — canonical Lahman CSVs since the `chadwickbureau/baseballdatabank` repo was retired; the `nameFirst`/`nameLast`/`nameGiven` split §6 relies on.
3. [PostgreSQL — `pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html) — padding rule, shared/union similarity and the 0.3 `%` default computed in §3.2.
4. [PostgreSQL — `fuzzystrmatch`](https://www.postgresql.org/docs/current/fuzzystrmatch.html) — the `soundex`/`dmetaphone`/`levenshtein` toolbox §4 wants and this database lacks.
5. [PostgreSQL — `unaccent`](https://www.postgresql.org/docs/current/unaccent.html) — why the packaged function is not `IMMUTABLE` and cannot be indexed directly (§2).
6. [Unicode UAX #15 — Normalization Forms](https://www.unicode.org/reports/tr15/) — §2 step 1's composed-vs-decomposed hazard.
7. [Levenshtein](https://en.wikipedia.org/wiki/Levenshtein_distance) / [Damerau–Levenshtein](https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance) — §3's edit-distance rows and the transposition case.
8. [Jaro–Winkler distance](https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance) — match-window, transposition and prefix-boost definitions used in §3.1.
9. Winkler (1990), [*String Comparator Metrics … in the Fellegi–Sunter Model*](https://eric.ed.gov/?id=ED325505) — the prefix boost and the p = 0.1, ℓ ≤ 4 convention.
10. Fellegi & Sunter (1969), [*A Theory for Record Linkage*](https://doi.org/10.1080/01621459.1969.10501049) — the m/u weighting §8 defers to the linkage doc for.
11. Christen (2012), [*Data Matching*](https://doi.org/10.1007/978-3-642-31164-2) — normalization before comparison; phonetic codes as blocking keys, not scores.
12. Cohen, Ravikumar & Fienberg (2003), [*A Comparison of String Distance Metrics for Name-Matching Tasks*](https://www.cs.cmu.edu/~wcohen/postscript/ijcai-ws-2003.pdf) — basis for §3's "pick per field."
13. [Soundex](https://en.wikipedia.org/wiki/Soundex) + [NARA — Soundex Indexing System](https://www.archives.gov/research/census/soundex) — the rules used to hand-derive C642/K642, C260/S260, R163.
14. [Metaphone](https://en.wikipedia.org/wiki/Metaphone) — Philips' 1990/2000 algorithms; the dual primary/alternate code behind §4's verdict.
15. [NYSIIS](https://en.wikipedia.org/wiki/New_York_State_Identification_and_Intelligence_System) + [Beider–Morse](https://stevemorse.org/phonetics/bmpm.htm) — the Anglocentric and language-detecting alternatives set aside in §4.
16. [Spanish naming customs](https://en.wikipedia.org/wiki/Spanish_naming_customs) — apellido paterno/materno, particles, Portuguese order; the basis of §7.
17. [W3C — Personal names around the world](https://www.w3.org/International/questions/qa-personal-names) — why structured name fields beat a display string.
18. [Falsehoods Programmers Believe About Names](https://www.kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/) — the assumption inventory behind §2 and §6.
19. [Baseball Savant — CSV field docs](https://baseballsavant.mlb.com/csv-docs) — `player_name`'s `"Last, First"` shape, half the format split.
20. [Hepburn romanization](https://en.wikipedia.org/wiki/Hepburn_romanization) / [Revised Romanization of Korean](https://en.wikipedia.org/wiki/Revised_Romanization_of_Korean) — the systems behind §5's variants.

**Triton-internal evidence.** Code read 2026-08-12; no database queries run. `syncNewPlayers`
(`app/api/update/route.ts:17–62`, esp. `:21`, `:40`, `:50–53`) writes `players.name` from Savant's
`player_name` for pitchers and MLB People's `fullName` for batters — the mechanism behind the two formats.
`formatName` (`app/api/update/milb/route.ts:310–316`) takes the last whitespace token as the surname and
feeds `milb_pitches.player_name` at `:226`; `ensurePlayers` (`:420–449`) inserts `name: 'Unknown'`.
The Lahman fuzzy search is `app/api/lahman/search/route.ts:17–42`, duplicated at `app/api/chat/route.ts:367`;
the deterministic crosswalk is `scripts/import-lahman.ts:84–97`, with the `players.lahman_id` backfill at
`:223–244`. `retro_people` models `name_suffix`/`name_given` (`scripts/create-retro-tables.sql:20–47`) and
`retro_id_map_conflicts` is the ambiguity-log pattern (`:244–256`). `search_players`' body is not in the
repo; `scripts/fix-security-advisories.sql:203–204` documents its dependence on `pg_trgm`. TrackMan names
enter as free text at `lib/compete/pitchSchema.ts:293–294`. **The installed-extension list (PG 17.6:
`plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault`, `pg_trgm`) is Jo's measurement,
quoted from `docs/Queries.md:1128`** — `unaccent` and `fuzzystrmatch` are absent from it. **2026-08-12 packet:**
`players` = 16,931 rows / 16,418 distinct names (513 excess → 684–1,026 rows in collision), 553 non-ASCII
names, 16,474 `"Last, First"` vs 457 `"First Last"`, `lahman_id` 3,228 (19.07%), `position` 10,899 (64.4%),
`team` 0; `Gonzalez, Jose` = 114931/467102/681275/683681, joined by `Jackson, Alex`, `Perez, Fernando`,
`Vázquez, Christian`, `Williams, Matt`, `Wilson, Jacob` as four-way collisions; 0 orphans across
`pitches`/`milb_pitches`; `compete_pitches` 443 rows, 443 `tm_pitcher_id`, 0 `athlete_profile_id`.
