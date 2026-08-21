---
title: Pagination & Streaming — Shipping One Page Without Lying About the Rest
domain: frontend-data-scale
tags:
  - pagination
  - keyset-cursors
  - silent-truncation
  - streaming
  - incremental-hydration
  - infinite-scroll
  - statement-timeout
sources_reviewed: 14
last_updated: 2026-08-21
---

# Pagination & Streaming — Shipping One Page Without Lying About the Rest

> Doc 04 of `frontend-data-scale/`. Grades: **(verified)** read at `file:line` or from the shared
> packet; **(documented)** vendor docs; **(inferred)** mechanism; **(cargo-cult)** unsupported.

## TL;DR

- **Triton does not paginate its largest read; it truncates it** — `player-data/route.ts:44` ends in a bare `LIMIT 50000`. (verified)
- **`ORDER BY p.game_date DESC` means truncation eats the *oldest* rows** — the end of a career, where nobody looks. (verified)
- **The only number that could report completeness agrees with the truncation by construction** — `player/[id]/page.tsx:125` renders rows that arrived, not rows that matched. (verified)
- **Across 196 handlers: a few pages, several caps, one truncation** — 3 `.range(`, 36 SQL `LIMIT`s, ~404 of 467 `.select(` unbounded. (verified)
- **Offset paging over an untied `ORDER BY` can show a row twice or never**; both leaderboards sort with no tiebreak. Streaming has nowhere to land either — zero `loading.tsx`, zero `error.tsx`. (verified)
- **Keyset paging here is a timeout strategy before a UX one** — the RPC serializes every column of every row; 10,000 rows at 90 columns blew a 120 s ceiling. (documented)
- **Cas's founding bug was a pagination bug**: a `COUNT(*) … LIMIT 1 OFFSET n` probe returns zero rows for `n > 0`, so the backfill stopped after one batch and called it success. (verified)
- **Both paging UIs mislead**: Explore's "Load More" replaces rather than appends, and the pitch log's page count is derived from the truncated array. (verified)
- **"Raise the LIMIT so it never truncates" is cargo-cult** — it changes *which* queries truncate, never whether the screen can tell. (cargo-cult)

---

## 1. What Triton actually has

| Route | Mechanism | Bound | End detectable? |
|---|---|---|---|
| `app/api/player-data/route.ts:44` | hard cap | `LIMIT 50000` | **No** — `count` = page length |
| `/api/report` → `lib/reportQueryBuilder.ts:157` | offset | n ≤ 1000 | No total |
| `app/api/leaderboard-defence/route.ts:53` | offset (SQL) | n ≤ 500 | No |
| `app/api/leaderboard-triton/route.ts:45,179` | offset over a cached array | n ≤ 1000 | No |
| `app/api/emails/sends/route.ts:26-35` | `.range()` + `count:'exact'` | 20 | **Yes** |

`milb/player-data:17` and `imagine/heatmap-data:64` copy the cap; `scenes:23` is a third `.range()`;
`pitch-video:341` a fourth offset path. Two of 196 handlers can answer "how many are there?"
(verified). A cap is not a page: a page implies a successor, a cap implies nothing.

**The unbounded majority.** 467 Supabase `.select(` sites exist; 63 are bounded (verified). PostgREST
enforces `db-max-rows`, Supabase's default being 1000 (documented), so an unbounded `.select()`
matching more returns a short array with status 200 — Slice C's exact signature. Whether this project
holds that default is a dashboard setting, not a repo fact (inferred); it sizes ~404 sites.

---

## 2. Offset vs keyset

| | Offset (`LIMIT n OFFSET m`) | Keyset / seek (`WHERE (k) < (last_k)`) |
|---|---|---|
| Cost of page *p* | Computes and discards `m` rows (documented) | Constant — an index seek |
| Concurrent writes | Duplicates and skips at page seams (documented) | Stable; names a row, not a position |
| Ties in the sort key | Undefined without a unique tiebreak (documented) | Forced — the tiebreak *is* the cursor tail |

Postgres specifies that `LIMIT` without `ORDER BY` returns an unpredictable subset and that `OFFSET`
still computes skipped rows (documented). Both paged leaderboards sort with no unique tiebreak
(`lib/reportQueryBuilder.ts:153-154`, `leaderboard-defence:52`), so two pitchers tied at
`cmd_plus = 104` have no defined order and page 2 may repeat or drop one (verified). `, pitcher ASC`
kills the class.

**The timeout argument is stronger.** Reads go through `run_query` / `run_query_long`, which serialize
via `jsonb_agg(row_to_json(t))`: 5,000 rows at 90 columns cost **849 ms** wrapped vs **11.9 ms**
unwrapped, and 10,000 wide rows exceeded **120 s** (documented). Every `run_query` sits under an 8 s
`authenticator` cap, with shapes at 99.96% of it (verified). So `LIMIT 50000` over ~70 columns is
a boundary the route probably cannot reach — serialization fails first, as a 500 (inferred). Three
regimes: cheap; **truncating** (200 with a partial set, invisible); timing out (500, visibly broken).
Keyset pages of a few thousand rows hold every statement in the cheap regime *and* make the boundary
addressable. Plans and indexes are `Jo/postgres-performance/`; what a truncated sample *means* is
`Li/statistical-inference/`.

---

## 3. Cursor design

A cursor is a serialized position in a total order. Two rules survive production.

**The order must be total.** `game_date` is not unique; `pitches` has a natural key in the ingest
upsert. Sort `game_date DESC, game_pk DESC, at_bat_number DESC, pitch_number DESC`, and let that tuple
be the cursor (verified as the key; (inferred) as the design).

**Opaque, and bound to its query.** Google's guidance treats page tokens as opaque and `total_size` as
optional; Slack concluded the same after offset paging broke on churn (documented). Base64 the tuple
with a hash of the filters and sort, and reject mismatches — otherwise a changed filter reuses a stale
cursor and page 2 is a page of a *different* query, rendering as data rather than an error.

Return `{ rows, nextCursor, complete }`. `complete: true` is the affordance this doc is about: the
only way a surface says "this is all of it" without counting.

---

## 4. Founding case study: an offset probe that could not return a row

```sql
ctid = ANY(SELECT ctid FROM pitches WHERE … LIMIT n OFFSET m)  -- no ORDER BY
SELECT COUNT(*) FROM … LIMIT 1 OFFSET n                        -- the hasMore probe
```

`COUNT(*)` without `GROUP BY` yields exactly one row, so `OFFSET n` for `n > 0` returns **zero rows**.
The probe read "no more work" on the first check, every time; the backfill stopped after one batch,
that batch had no `ORDER BY` so its `ctid` window could overlap or skip anyway, and it returned 200
(verified). **A `hasMore` probe is a query whose failure mode is silence** — zero rows means "done"
and also "your probe is malformed"; prefer `rows.length === pageSize` on a page you fetched, or
`LIMIT pageSize + 1` and discard the extra. **`OFFSET` over an unordered set is sampling from an
undefined bag, not pagination** — the repaired route walks indexed `game_date` in half-open day
chunks. The shape is still live at `models/deploy:21,23`, `models/deploy/continue:14` (verified).

---

## 5. A vocabulary for silent truncation

Slice C of `docs/research-app-audit-scope.md` asks whether a path "silently truncates … returns a
partial result set with a success status." It needs terms, not another finding list. These four are
disjoint and greppable:

| Term | Definition | Detect by |
|---|---|---|
| **Cap** | Constant bound, no successor token | `LIMIT <int>`, no `OFFSET`/cursor param |
| **Page** | Bound plus a way to request the next one | accepts `offset`/`cursor` **and** returns it |
| **Truncation** | Cap reached, status 200, caller cannot tell | `rows.length === cap`, no `truncated` field |
| **Completeness claim** | Anything on screen read as "all of it" | a rendered row count or "N pitches" |

The failure is not truncation. It is a **truncation paired with a completeness claim**: `player-data`
returns `count: validated.length` at `:54`, `usePlayerData` passes it through, `player/[id]/page.tsx:125`
prints "50,000 pitches." Every step is correct; the composition asserts a fact nobody checked
(verified). A cap plus `truncated: true` costs one comparison. Whether the *missing* rows are instead
a pipeline gap is `Jo/data-reliability/`; what the metric should measure is Soto's.

---

## 6. Streaming and incremental hydration

Next.js 16 streams through Suspense boundaries; `loading.tsx` creates one per route segment,
`error.tsx` the matching error boundary (documented). Triton has **zero of each across 96 pages**, and
its five `<Suspense>` sites are not analytics routes (verified) — partial renders cannot land.

Ranked by fit: `loading.tsx` / `error.tsx` per segment is **high** (four pairs cover the research app);
NDJSON chunked rows **medium**, already in-repo at `data-export/route.ts:298-301` (verified);
streaming the 50k payload **low**.

**Streaming cannot precede pagination here.** `run_query` returns one JSON value, so nothing flushes
until the statement finishes. Chunked delivery arrives only once the read is split into cursor pages —
at which point "stream" and "next page" are one mechanism.

---

## 7. Infinite scroll, and the two Triton already ships

Infinite scroll suits exploratory browsing and harms goal-directed comparison (documented); Triton's
tables are the latter. Mobile Explore pages at `limit = 50` (`useExploreData.ts:118,182`) behind a
"Load More" button (`MobileExplore.tsx:382`), with two classic defects (verified). **Replace, not append:** `page`
is in the react-query key and `:285` does `setRows(queryRows)`, so incrementing `page` at `:352`
fetches page 2 and overwrites page 1 — a button labelled "Load More" that loads *instead*. **A full
page is not evidence of a next page:** the gate `rows.length >= limit` shows the button on an
exactly-full last page, and after the replacement a short next page hides it, so the list shrinks.
`useInfiniteQuery` accumulates `pages` and derives `hasNextPage` from `getNextPageParam` returning
`undefined` (documented), and `^5.100.10` is already a dependency with **0** uses of it.

The second is quieter. `components/dashboard/PitchLogTab.tsx:28-29,46-47` is a proper pager —
`perPage = 50`, `sorted.slice(...)`, `totalPages = Math.ceil(sorted.length / perPage)` — but it pages
the array §1 truncated, so `totalPages` reads as the archive's size (verified). **Paging a truncated
array launders the truncation into a page count**: a completeness claim with a number attached.

---

## 8. What Triton should do, in order

1. **Add `truncated: rows.length >= LIMIT`** to `player-data:54`, `milb/player-data:25`, `imagine/heatmap-data`.
2. **Render it** at `player/[id]/page.tsx:125`: "50,000+ pitches (oldest seasons not loaded)".
3. **Derive `totalPages` from a server total, not `sorted.length`** (`PitchLogTab.tsx:47`).
4. **Add unique tiebreaks** at `lib/reportQueryBuilder.ts:154`, `leaderboard-defence:52` — offset
   paging stays, it stops being nondeterministic.
5. **Move `useExploreData` to `useInfiniteQuery`** so mobile appends and derives `hasNextPage` honestly.
6. **Keyset-page `/api/player-data`** on `(game_date, game_pk, at_bat_number, pitch_number)`, opaque
   cursor, `complete: boolean` — also the fix for the serialization ceiling.
7. **Add `loading.tsx` + `error.tsx`** to `app/(research)`, `(milb)`, `(compete)`, `(broadcast)`.
8. **Regression-test the shape**: a fixture at exactly `LIMIT` rows must set `truncated`, and any
   `hasMore` probe must run past batch one (`Cas/testing-data-systems/`).

**Anti-recommendation: do not raise `LIMIT 50000`.** Three independent grounds. *Wrong ceiling* —
serialization binds before the constant does; 10,000 rows at 90 columns already exceeded 120 s, so a
higher cap buys rows the statement cannot return. *No change to what the screen can say* — 80,000 is
as invisible as 50,000; the defect is the absent `truncated` flag. *Degrades the common case to serve
the tail* — every extra row is main-thread filter, sort, and render work for the 99% of players
nowhere near the cap. `planning.md:49` records the move applied once: `pitch-video` 500 → 1000 "so a
full game never truncates" — one shape fixed, no detection added.

**Highest-leverage next action:** return `truncated` from `app/api/player-data/route.ts` and render it
at `player/[id]/page.tsx:125` — under an hour, and it turns the platform's largest silent truncation
into a stated one.

---

## Sources

1. Markus Winand — [Keyset pagination](https://use-the-index-luke.com/no-offset) — §2's case against `OFFSET`.
2. Markus Winand — [Fetch next page](https://use-the-index-luke.com/sql/partial-results/fetch-next-page) — the seek SQL §3 copies.
3. PostgreSQL — [LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html) — unpredictable order without `ORDER BY`.
4. PostgREST — [Pagination and counts](https://docs.postgrest.org/en/latest/references/api/pagination_count.html) — count modes behind §3.
5. Supabase — [REST API guide](https://supabase.com/docs/guides/api) — §1's Max Rows ceiling.
6. Supabase #1742 — [Past 1000 rows](https://github.com/orgs/supabase/discussions/1742) — the default biting callers.
7. TanStack Query — [Infinite Queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) — §7's fix.
8. Next.js — [`loading.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) — the boundary Triton lacks.
9. Next.js — [`error.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/error) — the error boundary, also absent.
10. React — [`<Suspense>`](https://react.dev/reference/react/Suspense) — §6's boundary semantics.
11. Vercel — [Streaming functions](https://vercel.com/docs/functions/streaming-functions) — not §6's blocker.
12. ndjson — [spec](https://github.com/ndjson/ndjson-spec) — the framing `data-export` emits.
13. NN/g — [Infinite scrolling](https://www.nngroup.com/articles/infinite-scrolling-tips/) — §7's paging argument.
14. Google AIP-158 — [Pagination](https://google.aip.dev/158) — opaque page tokens; §3's rule 2.

**Triton-internal evidence (repo read 2026-08-21, commit `6555039`; no production query run).**
`app/api/player-data/route.ts:44` (`ORDER BY p.game_date DESC LIMIT 50000`), `:45` (`run_query_long`),
`:54` (`count: validated.length`); same cap at `milb/player-data:17`, `imagine/heatmap-data:64`; read
by `lib/hooks/usePlayerData.ts` (`selectedYear` starts `null`, so first load is the whole career),
rendered at `app/(research)/player/[id]/page.tsx:125`. Over **196** handlers (packet): **36** SQL
`LIMIT <int>`; **3** `.range(`; **27** `.limit(`; **29** `count: ….length` returns; **2** true totals
via `count:'exact'` (`emails/sends:26-35`, `emails/audiences/[id]/subscribers:19-33`). Repo-wide
**467** `.select(` sites, **63** bounded. Offset paths:
`lib/reportQueryBuilder.ts:153-157` (untied `ORDER BY`), `leaderboard-defence:52-53`,
`leaderboard-triton:44-46,178-181`, `pitch-video:328-346`. Founding bug in the repaired route's header,
`app/api/admin/backfill-stuff-plus/route.ts:29-33`, chunk sizing `:11-18`; unordered-`ctid` batching
at `models/deploy:21,23`, `models/deploy/continue:14`. Serialization and cap figures:
`docs/reliability-findings-2026-08-11.md:307-313`, `:184` (7,997.0 ms = 99.96% of 8 s). Pagers:
`lib/hooks/useExploreData.ts:118,182,285,352`, `components/mobile/MobileExplore.tsx:382-387`,
`components/dashboard/PitchLogTab.tsx:28-29,37,46-47`; **0** `useInfiniteQuery`, **0**
`IntersectionObserver`, 9 react-query imports (packet). Streaming: **0** `loading.tsx`, **0**
`error.tsx` over **96** pages, **5** `<Suspense>` sites, **2** streaming routes
(`data-export:298-301`, `auto-compose:58,161`). Cap-raise precedent `planning.md:49`; audit
`docs/research-app-audit-scope.md`.
