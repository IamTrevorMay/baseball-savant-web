---
title: Cross-Level & Cross-Instrument Comparability — MLEs, Translation Factors, and Category Errors
domain: metric-governance
tags:
  - cross-level
  - major-league-equivalency
  - translation-factors
  - level-difficulty
  - selection-bias
  - instrument-agreement
  - milb
  - trackman
sources_reviewed: 21
last_updated: 2026-08-11
---

# Cross-Level & Cross-Instrument Comparability

## TL;DR

- **"Cross-level" and "cross-instrument" are two independent failure modes and Triton conflates them.** Level changes the *population*; instrument changes the *sensor and its conventions*. Fixing one does nothing for the other; `compete_pitches` has both at once, plus a context difference. **(established)**
- **Bill James' 1985 MLE is a ratio-of-league-context translation, not a discount rate** — rate stats relative to the player's own league, re-expressed in the target's terms; Davenport Translations and every modern descendant refine that one idea. Only *rate* stats translate: counting stats need a stated playing-time assumption, and already-normalized composites need **re-baselining**, not a factor. **(established)**
- **The selection bias is precise and unsolved:** you observe translations only for players good enough to be promoted, and extended MLB samples only for players good enough not to be demoted — AAA truncated on the upper tail, MLB on the lower. **(established)**
- **For Triton's Stuff+ specifically, the MLE framework is the wrong tool.** Stuff+ is a function of `release_speed`, `total_movement_in`, and `release_extension` — properties of the pitch, not of the opposition. Level difficulty never enters. The MLB↔AAA gap is a pure *re-baselining* artifact, and the fix is one join, not a translation factor. **(estimated — the load-bearing claim here)**
- **`milb_pitch_baselines` and `pitch_baselines` are separately-computed populations with identical schema and identical formula, so the values look interchangeable and are not.** Both keyed `(pitch_name, game_year)`; nothing in the column, type, or label distinguishes them. **(computed — read from source)**
- **The Povich case, measured 2026-08-11: his July Triple-A 100.0 and his August MLB 97.7 are not on the same scale, so "he declined on promotion" is unsupported.** The defensible comparison is MLB-to-MLB: May 100.0 → Aug 97.7 — and even that crosses the 2026-08-11 rescore seam, carrying ±0.3–0.6 points of vintage bias, up to a quarter of the 2.3-point move. Only June→August is fully clean. **(computed — the figures; the inference is Li's)**
- **The Povich signal survives anyway, because an independent mechanism corroborates it.** FF 98.4 → 95.8 at rising usage (43% → 49%), with FF release height 6.05 → 5.87 ft and release side 1.08 → 1.29. Stuff+ has no release-position term, so the arm-slot drop is separate evidence, not the same number twice. At 149 pitches this is a hypothesis, not a finding. **(computed + estimated)**
- **`milb_pitches.events` is normalized by a 27-entry map with a `toLowerCase()` fallback, so the column is a *mixture* and the fallback invents non-MLB values** — `'Bunt Groundout'` → `bunt_groundout`, which MLB calls `field_out`. Partial normalization is worse than none. **(computed — read from source)**
- **A shared axis is a category error, not an approximation, when the referent differs rather than the value.** MLB Stuff+ asks "relative to MLB pitches"; AAA Stuff+ asks "relative to AAA pitches." No scalar reconciles a changed referent. **(established)**
- **Li's recommendation: forbid mixed-level display today, re-score MiLB against `pitch_baselines` as the permanent fix, and do not build an MLE translation factor for Stuff+.** Reserve MLEs for outcome stats, where level difficulty is genuinely causal. **(estimated)**

---

## 1. Two axes, routinely conflated

| Axis | What differs | Detect how | Fix how |
|---|---|---|---|
| **Level** | Normalization population; quality of opposition | Same player, both levels, same season | Re-baseline to a common population, or estimate a translation factor |
| **Instrument** | Sensor tech, reference frame, units, vendor smoothing and classification | Same pitch measured twice, or same pitcher across a hardware change | Agreement study → calibration offset; or refuse to mix |
| **Context** | Game vs bullpen, competitive vs assessment, park/altitude | Same pitcher, both contexts, same instrument | Usually not fixable — separate the surfaces |

`compete_pitches` differs from `pitches` on all three at once. The trap: *level* is the axis everyone discusses, *instrument* is the one that corrupts pitch-characteristic metrics.

---

## 2. Major League Equivalencies: the lineage

| Approach | Author / era | Core idea | Where it breaks |
|---|---|---|---|
| **Original MLE** | Bill James, *Abstract 1985* | Rate stats relative to own league, re-expressed in the target's context | Fitted on the era's promotion patterns; rate-only; no age or park handling |
| **Davenport Translations** | Clay Davenport, BP, 1990s–2000s | Numeric **difficulty ratings** per league-season (AAA-1998 ≠ AAA-2005) | The ratings are themselves estimated from selection-biased promotion flows |
| **Projection-embedded** | ZiPS, Steamer, PECOTA-lineage | Translation is a hidden layer in the projection | Not auditable — you cannot inspect the factor you trust |
| **Prospect models** | KATOH-era FanGraphs, 2015+ | Model P(MLB outcome \| MiLB inputs) directly | A forecast, not a translation |
| **Tracking-native** | Post-2020, Hawk-Eye in AAA | Compare *physical* pitch traits directly | Valid only where the instrument is comparable — an empirical claim |

The last row is where Triton lives, and it has the least published methodology behind it.

### 2.1 Rate translates, counting does not

| Stat class | Translatable? | Why |
|---|---|---|
| **Rate** (K%, BB%, wOBA, AVG) | Yes — multiply by a factor | The factor acts per-opportunity; opportunities held fixed |
| **Counting** (HR, RBI, IP, W) | **No, not directly** | A translated count requires an assumed playing-time allotment — the exact thing the promotion decision determines |
| **Composite/normalized** (wRC+, ERA+, Stuff+) | Only by **re-baselining** | Already normalized. Translating means changing the referent — you re-normalize, you don't scale |

Correct procedure for a counting stat: translate the *rate*, multiply by a **stated** playing-time assumption, report the assumption.

---

## 3. Level difficulty and the selection problem

The standard identification strategy is **paired within-season observation**: players who appeared at both levels in one season, within-player delta, averaged. Right design, biased two ways — **promotion truncation** (AAA→MLB movers are selected on the upper tail of their AAA line, which therefore contains their positive noise) and **demotion truncation** (MLB stints end when a player is sent down, censoring the lower tail). The biases run opposite, which is the basis of the only practical control:

> **Bracket it.** Estimate the delta separately from the promotion flow (AAA→MLB) and the demotion flow (MLB→AAA). Each is biased in a known and opposite direction; the truth lies between. A tight bracket is a usable number. A wide one tells you the data cannot identify a factor at all.

Heckman-style selection models need an exclusion restriction — something driving promotion but not performance. Triton's schema has none.

---

## 4. Instruments are a separate problem

| System | Technology | In Triton | Convention hazards |
|---|---|---|---|
| **Hawk-Eye** | Multi-camera optical; MLB 2020+, Triple-A since the ABS rollout | `pitches`, `milb_pitches`, `wbc_pitches` | `pfx_x`/`pfx_z` in **feet**, catcher's-perspective signs; `release_extension` vendor-derived |
| **TrackMan** | Doppler radar (3D); MLB Statcast 2015–19 | `compete_pitches`; `pitches` pre-2020 | `InducedVertBreak`/`HorzBreak` in **inches**, different reference trajectory than `pfx_z`; `RelSpeed` at release, not Savant's 50-ft convention |
| **Rapsodo** | Camera + radar hybrid, single unit | Not ingested (facility-adjacent) | Shortest measurement window; spin axis inferred, not fit from full trajectory |

**Reference-frame mismatch is not a calibration difference.** `pfx_z` (feet, gravity-referenced) and `InducedVertBreak` (inches, spin-induced reference) are different quantities; ×12 does not convert one to the other. Where the quantity *is* the same (velo), agreement is measured, not assumed — Bland–Altman, bias plus limits of agreement; two devices can correlate at r = 0.99 and sit 1.5 mph apart. **(established)**

**Pitch classification is part of the instrument.** MLB `pitch_name` comes from Statcast's classifier; MiLB `pitch_name` from `PITCH_NAME_MAP` (`app/api/update/milb/route.ts`), a hand-written Stats-API-code map where `ST` and `SV` both collapse to `'Sweeper'`. Baselines are keyed on `pitch_name`, so **the baseline cells are not the same construct across levels**. **(computed)** `compete_pitches` already carries `device`; make it a rule — **no pitch row without a recorded instrument.**

---

## 5. Triton's four pitch populations

| Table | Level | Instrument | Coverage | Stuff+ baseline | `events` casing |
|---|---|---|---|---|---|
| `pitches` | MLB | Hawk-Eye 2020+, TrackMan 2015–19 | 2015–2026 | `pitch_baselines` | lowercase (`strikeout`, `field_out`) |
| `milb_pitches` | AAA only | Hawk-Eye | 2023+ | `milb_pitch_baselines` | **mixed** — see §6 |
| `wbc_pitches` | International tournament | Hawk-Eye, venue-dependent | tournament years | **none — unscored** | Stats API native |
| `compete_pitches` | Facility / amateur | TrackMan | session-based | **none — different schema** | n/a |

Four populations, three instrument regimes, one column name (`stuff_plus`) shared by two of them with different meanings, and no discriminator on the value. `wbc_pitches` is the trap — it looks most like MLB and is among the least comparable; its missing Stuff+ column is a feature.

### 5.1 The worked example — Cade Povich, measured 2026-08-11

| Month | Level | Stuff+ | Baseline population |
|---|---|---|---|
| Feb | MLB | 98.2 | `pitch_baselines` |
| Mar | MLB | 98.8 | `pitch_baselines` |
| Apr | MLB | 98.2 | `pitch_baselines` |
| May | MLB | 100.0 | `pitch_baselines` |
| **Jul** | **AAA** | **100.0** | **`milb_pitch_baselines`** |
| Aug | MLB | 97.7 | `pitch_baselines` |

**The wrong reading:** "100.0 in July, 97.7 in August — he lost stuff on promotion." July's 100.0 means *exactly average among 2026 AAA pitches of that type*; August's 97.7 means *slightly below average among 2026 MLB pitches of that type*. Different claims about different populations that share a numeral. No translation factor exists in the repo, so the comparison cannot be corrected — only withdrawn.

**The defensible reading:** May 100.0 → Aug 97.7, both MLB-referenced. A 2.3-point drop — which still crosses the 2026-08-11 rescore seam. Per `05-baseline-normalization-design.md`, that repair rescored Jun–Aug against current baselines while Feb–May kept their original nightly vintages, so May→Aug carries ±0.3–0.6 points of vintage bias, ~26% of the move. Only Jun→Aug is fully clean.

**Is 2.3 points real?** Composite pitch-level SD ≈ 6.5 (doc 05, estimated). At n = 149, SE ≈ 0.53 under independence; pitches within an outing correlate, and a design effect of 2–4 gives effective SE 0.8–1.1, so SE of the difference lands near 1.1–1.8. The move is **1.3–2.1 SE** — suggestive, not conclusive, before subtracting vintage bias.

**What makes it actionable** is the disaggregated pattern, not the composite:

| Signal | May | Aug | Note |
|---|---|---|---|
| FF Stuff+ | 98.4 | 95.8 | −2.6, larger than the composite move |
| FF usage | 43% | 49% | Mix shifting *toward* the weakening pitch |
| FF release height (ft) | 6.05 | 5.87 | −0.18 ft ≈ −2.2 in |
| FF release side (ft) | 1.08 | 1.29 | +0.21 ft |

Stuff+ contains **no release-position term** — only velo, movement, extension — so the arm-slot change is independent evidence, not a restatement. A lower, wider slot coinciding with a fastball-quality drop *and* increased reliance on that fastball is a coherent mechanism.

**Li's call:** the composite decline sits inside the noise band and is partly a baseline artifact; the mechanically corroborated *fastball* decline is a hypothesis worth monitoring at n = 149. Grade it **estimated**, not computed, and say so on the surface — see `Li/statistical-inference/09-small-sample-communication.md`.

---

## 6. Schema-level incomparability — the silent kind

`CLAUDE.md` says `milb_pitches.events` is Title Case. The code disagrees, and is worse than the doc — `app/api/update/milb/route.ts:244`:

```ts
events: event ? (EVENT_NORMALIZE_MAP[event] ?? event.toLowerCase().replace(/ /g, '_')) : null,
```

1. **The column is a mixture** — rows written before normalization keep Title Case, later rows are lowercase. `WHERE events = 'strikeout'` returns *some* strikeouts. No error, an undercount.
2. **The fallback invents values MLB does not have.** `'Bunt Groundout'` → `bunt_groundout`; MLB records `field_out`. Lowercase and snake_cased, so it *looks* MLB-native. A cross-level union yields a category present in one arm and impossible in the other.
3. **`EVENT_NORMALIZE_MAP` has 27 entries** against a larger MLB vocabulary; every unmapped value takes the fallback silently.

Audit query (log to `docs/Queries.md`):

```sql
SELECT m.events, count(*) AS n
FROM   milb_pitches m
WHERE  m.events IS NOT NULL
  AND  m.events NOT IN (SELECT DISTINCT events FROM pitches WHERE events IS NOT NULL)
GROUP  BY 1 ORDER BY n DESC;
```

Anything returned is Title Case residue or a fallback-invented category. Both are cross-level filter bugs.

**The latent level-pooling defect.** `milb_pitch_baselines` is keyed `(pitch_name, game_year)` with no `level`, and its insert reads `FROM milb_pitches` unfiltered — correct today only because the ingest is AAA-only. Uncomment `AA: 12` and every AAA pitch is scored against a pooled AAA+AA distribution: no schema change, no migration, no signal in the data.

---

## 7. When a shared axis is a category error

| Situation | Verdict | Reason |
|---|---|---|
| Different level, same instrument, **outcome-based** (K%, wOBA) | Approximation — translate | Level difficulty is genuinely causal; a factor is the right object |
| Different level, same instrument, **normalized to different populations** (Stuff+) | **Category error** | The referent differs, not the value |
| Same level, different instrument, raw physical units (velo) | Approximation — calibrate | Bland–Altman bias + limits of agreement |
| Different instrument, different reference frame (`pfx_z` vs `InducedVertBreak`) | **Category error** | Different physical definitions, not two measurements of one thing |
| Counting stats across levels | **Category error unless playing time is stated** | The translated count encodes an unstated assumption |
| Percentile / rank across levels | **Category error** | Rank is defined by population membership |

The operational test: **if you can name the scalar that would fix it, it is an approximation; if the fix requires re-answering the question, it is a category error.** Stuff+ across levels fails it — the AAA value is not a biased estimate of an MLB quantity, it is an unbiased estimate of a different one. Category errors get **structural separation** — separate panels, separate axes, a level chip on every row — never a footnote. Presentation is Cas's lane (`Cas/analytics-ux/09-comparative-display-benchmarks.md`); the *classification* is Li's, and Cas should be handed this table rather than deciding case by case.

---

## 8. What Triton should do, in order

**1. Forbid mixed-level display today.** Any query unioning `pitches` with `milb_pitches` must carry a literal `level` column to the surface — `SELECT 'MLB' AS level, … UNION ALL SELECT 'AAA', …`. The union is fine; `avg(stuff_plus)` *over* the union, or one line chart connecting the two series, is not.

**2. Add `stuff_plus_mlb` to `milb_pitches` — score MiLB against the MLB baseline.** The permanent fix, one join, comparable because Stuff+ inputs are physical properties of the pitch:

```sql
-- Identical to computeMilbStuffPlus, with exactly one thing changed: the baseline table.
UPDATE milb_pitches p
SET    stuff_plus_mlb = GREATEST(0, LEAST(200, ROUND((
         100 + COALESCE((p.release_speed - b.avg_velo)/NULLIF(b.std_velo,0),0)*4.5
             + COALESCE((SQRT(POWER(p.pfx_x*12,2)+POWER(p.pfx_z*12,2)) - b.avg_movement)
                        /NULLIF(b.std_movement,0),0)*3.5
             + COALESCE((p.release_extension - b.avg_ext)/NULLIF(b.std_ext,0),0)*2.0
       )::numeric)))
FROM   pitch_baselines b        -- MLB, deliberately — not milb_pitch_baselines
WHERE  p.pitch_name = b.pitch_name AND p.game_year = b.game_year
  AND  p.game_date BETWEEN $1 AND $2 AND p.release_speed IS NOT NULL;
```

Keep both: `stuff_plus` ("how good was this for AAA") and `stuff_plus_mlb` ("how would it play up"). Two columns, two questions. `docs/VARIABLES.md` in the same commit.

**3. Add `level` to the `milb_pitch_baselines` key before expanding `SPORT_IDS`** — while AAA is the only level and the migration is a no-op.

**4. Audit and repair `milb_pitches.events`.** Run the §6 query, extend `EVENT_NORMALIZE_MAP` to full MLB coverage, replace the `toLowerCase()` fallback with `null` plus a logged warning, backfill. A fallback that guesses is worse than one that abstains.

**5. Require an instrument column on every pitch table.** `pitches` and `milb_pitches` have none, which makes the 2015–19 TrackMan → 2020+ Hawk-Eye transition inside `pitches` invisible — a real discontinuity in any multi-year comparison.

**6. Only then, if outcome-stat MLEs are wanted, build them with the bracket.** Aggregate each side to `(pitcher, pitch_name, game_year)`, inner-join `milb_pitches` to `pitches` on that key, require `n >= 50` on both arms and `>= 10` paired pitchers per pitch type, and take `avg(mlb - aaa)` weighted by `LEAST(n_aaa, n_mlb)`. Run it twice — promotion flow, then demotion flow — and report the range, not a point. Note also what it measures once step 2 ships: with both sides MLB-referenced, a non-zero delta is no longer a level effect but **instrument or park calibration drift between the MLB and AAA Hawk-Eye installs**.

### Anti-recommendation

**Do not build an MLB↔MiLB Stuff+ translation factor.** It is the intuitive move, it has an impressive literature behind it, and for this metric it is wrong. A factor presumes the AAA value is a *biased estimate of an MLB quantity*; it is an unbiased estimate of a *different* quantity. Applying one takes a correct number, adds selection-biased noise, and returns something authoritative-looking and unfalsifiable. Worse, it ossifies: fitted once, stored as a constant, never re-derived as baselines drift — two vintage problems instead of one.

Re-baselining is strictly better: exact, one join, no identification strategy, inherits baseline updates automatically, both questions answerable. Reserve MLE machinery for K%, BB%, wOBA, and wRC+, where level difficulty is genuinely causal.

---

## Sources

1. Bill James, *The Bill James Baseball Abstract 1985* — the original MLEs (book; no canonical URL).
2. [Bill James Online](https://www.billjamesonline.com/) — later commentary on MLE limitations.
3. [Clay Davenport](http://claydavenport.com/) — Davenport Translations and per-league-season difficulty ratings, from their author.
4. [BP legacy archive](https://legacy.baseballprospectus.com/) — original Davenport-era MLE methodology posts.
5. [Baseball Prospectus glossary](https://www.baseballprospectus.com/glossary/) — DT-lineage translated stats.
6. [FanGraphs Library](https://library.fangraphs.com/) — definitions for the rate stats translation applies to.
7. [FanGraphs Community Research](https://community.fangraphs.com/) — independent MLE and level-difficulty replications.
8. [The Hardball Times](https://tht.fangraphs.com/) — long-form MLE methodology, incl. Cartwright's Oliver-era translations.
9. [Phil Birnbaum — Sabermetric Research](https://blog.philbirnbaum.com/) — selection bias in promotion-based estimates.
10. [Tom Tango — Inside The Book](http://www.insidethebook.com/ee/) — what MLEs can and cannot identify.
11. [Tangotiger.com](http://tangotiger.com/) — regression/stabilization tools behind the §5.1 arithmetic.
12. [Chadwick Bureau register](https://github.com/chadwickbureau/register) — the ID crosswalk cross-level joins need.
13. [B-Ref minor league register](https://www.baseball-reference.com/register/) — cross-level records for paired samples.
14. [Baseball Savant field docs](https://baseballsavant.mlb.com/csv-docs) — units for `pfx_x`/`pfx_z`, `release_speed`, `events`.
15. [MLB Statcast glossary](https://www.mlb.com/glossary/statcast) — Hawk-Eye and the 2020 move off radar.
16. [Hawk-Eye Innovations](https://www.hawkeyeinnovations.com/) — optical tracking methodology.
17. [TrackMan Baseball](https://www.trackman.com/baseball) — radar definitions incl. `InducedVertBreak`.
18. [Rapsodo](https://rapsodo.com/) — hybrid camera/radar; shortest measurement window.
19. [Driveline Baseball](https://www.drivelinebaseball.com/blog/) — public device-agreement work across all three.
20. [Alan Nathan — Physics of Baseball](http://baseball.physics.illinois.edu/) — trajectory reconstruction, reference frames.
21. Bland JM, Altman DG, "Statistical methods for assessing agreement between two methods of clinical measurement," *The Lancet* 327(8476):307–310, 1986.

**Triton-internal evidence (2026-08-11):** Povich monthly Stuff+, FF splits, usage, and release-position figures measured 2026-08-11 (n = 149, August window). Code read: `app/api/update/milb/route.ts` (`SPORT_IDS`, `PITCH_NAME_MAP`, `EVENT_NORMALIZE_MAP` L244, `computeMilbStuffPlus`) and `lib/compete/pitchSchema.ts` (`device`, `induced_vert_break`). Vintage-drift and composite-SD figures from `05-baseline-normalization-design.md`. Cross-refs: `05-baseline-normalization-design.md`, `Li/statistical-inference/09-small-sample-communication.md`, `Cas/analytics-ux/09-comparative-display-benchmarks.md`.
