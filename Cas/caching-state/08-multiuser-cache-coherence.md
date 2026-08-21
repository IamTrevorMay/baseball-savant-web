---
title: Multi-User Cache Coherence — Whose View Is Right When Two People Are Looking
domain: caching-state
tags:
  - cache-keys
  - multi-tenancy
  - cdn-caching
  - read-your-writes
  - rls
  - realtime-divergence
  - concurrent-editing
sources_reviewed: 13
last_updated: 2026-08-21
---

# Multi-User Cache Coherence — Whose View Is Right When Two People Are Looking

> Grades: **(verified)** read at `file:line` · **(documented)** vendor docs or spec ·
> **(inferred)** mechanism · **(cargo-cult)** unsupported. No production query was run.

## TL;DR

- **The cross-user CDN leak this audit went looking for is not there.** Of 30 route files that hand-set `Cache-Control`, exactly 3 read the caller's identity, and all 3 send `no-cache`. (verified)
- **That safety is a property of the content, not a decision.** Zero `Vary` headers, zero `private`, zero `no-store`, and `middleware.ts:75` exempts every `/api/*` path from the auth gate. (verified)
- **One shared cache key is under-specified and collides today.** `/api/trends` reads `trends:{season}:{playerType}:{minPitches}` but its Stuff tab writes `trends:stuff:…`, so a warm Overview entry is served to a tab expecting a different shape. (verified)
- **The Work Kanban board cannot diverge between two users — it is single-writer by RLS.** `Users manage own work_tasks` covers writes; `Work admins read all tasks` is SELECT only. (verified)
- **It still diverges across two tabs of one user, and `WorkBoard.tsx:523-538` hides the rejection**: `supabase-js` resolves with `{ error }` rather than throwing, so the bare `catch` never runs. (verified)
- **Broadcast is the only concurrent multi-writer surface, and its writer set is unbounded**: `trigger/route.ts:35` treats the session ID as a capability token with no auth. (verified)
- **The DB-backed cache is the one coherence decision the repo got right by construction**: an in-process cache on Vercel would be per-instance and incoherent across invocations. (documented)
- **No Triton surface can say "someone else changed this":** zero `version`/ETag/conflict handling, zero `visibilitychange` listeners, `refetchOnWindowFocus: false`. (verified)

---

## 1. Three shapes of "multi-user," three requirements

| Surface | Sharing mechanism | Concurrent writers? | Coherence means |
|---|---|---|---|
| Broadcast | `broadcast_project_members` roles (`checkProjectAccess.ts:9-36`) | **Yes** — two producers supported | Convergence, live |
| Work app | `work_roles` + `is_work_admin()` / `is_work_staff()` | **No** for `work_tasks`; yes for team goals | Reader freshness |
| Compete | `athlete` sees Compete only (`lib/roles.ts:26-37`) | Coach writes, athlete reads | Isolation, then visibility |

Three requirements; one implementation everywhere — one fetch, no version, no signal. (verified)

---

## 2. The shared-key audit: is a global key safe here?

`lib/queryCache.ts` is a **server-side, DB-backed, globally shared** cache. Its keys carry no user
identity — safe if and only if the bytes are identical for every caller.

| Route | Key | Inputs | User-varying? |
|---|---|---|---|
| `app/api/trends/route.ts:15` | `trends:{season}:{playerType}:{minPitches}` | POST body | No (verified) |
| `movement-percentiles/route.ts:43` | `mvpct:{season}:{hand}:{pt:velo,…}` | query string | No (verified) |

Neither constructs a session client, calls `auth.getUser()`, or reads a cookie. Both query `pitches`
through `supabaseAdminLong` — the service role, which bypasses RLS identically for everyone. No
per-user dimension exists for a key to omit. Layer 1 is clean for the same reason: `lib/queryKeys.ts`
defines 21 react-query factories and **not one takes a user id**. (verified)

Being DB-backed is also right, and not obvious. A module-scope `Map` in a route file is per-instance
on Vercel: functions scale to many concurrent instances with no shared process, so N users hit N
caches with N fill times and no coherent invalidation. (documented) `query_cache` is one copy, every
instance, cleared by one `DELETE … LIKE 'prefix%'`. **"Just memoize it in the route module" is the
cargo-cult version.** (cargo-cult)

### 2.1 The one real key defect, and it is not about users

`/api/trends` builds its read key at `:15` and checks it at `:16`, both **before** branching on
`tab` — while the Stuff and Arsenal branches write to `trends:stuff:…` (`:74`) and
`trends:arsenal:…` (`:110`), keys nothing ever reads.

`lib/hooks/useTrendsData.ts:175` posts `{season, tab:'stuff', minPitches}` with no `playerType`, so
the route defaults it to `'pitcher'` (`:10`); `:197` posts Overview with the same season and the same
`minPitches` state (`:110`). The two produce the **identical read key**. Load Overview, then click
Stuff, and the Stuff branch is never reached: `getCached` hits and returns `{rows: […]}` to a tab
rendering `{leaders, gainers, losers}` — empty tab, HTTP 200, for up to the 6-hour TTL. (verified)
A cache key claims the response is a function of the key alone; omitting `tab` differs from omitting
`user_id` only in blast radius. (inferred)

---

## 3. The CDN audit: `public` on user-scoped data

Vercel's CDN is a **shared** cache keyed on URL plus `Accept`/`Accept-Encoding` plus whatever `Vary`
names — **cookies are not in the key**, and Supabase sessions are cookie-based, so Vercel's "no
`Authorization` header" exclusion does not protect Triton. (documented)

| Header class | Files | CDN-cached? | Identity-aware in class |
|---|---|---|---|
| `s-maxage` present | 12 | **Yes** (documented) | **0** (verified) |
| `max-age` only | 13 | No — `s-maxage` is required to store a function response | 0 |
| `no-cache` / `no-store` | 5 | No — excluded by the cacheable criteria | 3 |

The three identity-aware routes are `data-export/route.ts:292,375`, `render-trends/route.ts:19-20`
and `auto-compose/route.ts:22-23`, all `no-cache`. **No cross-user CDN leak exists in this repo
today** — stated plainly, because the honest finding is the absence of one. (verified)

Two caveats. `no-cache` is the weaker right answer — RFC 9111 lets a shared cache *store* it and
revalidate, where `no-store` forbids storage and `private` bars a shared cache outright — so Vercel
gets the outcome right while the header asserts the wrong thing. (documented) And nothing stops the
next route: `middleware.ts:70,75` exempts `/api/*` from auth and the header strings are hand-written,
so the next authenticated GET copying `public, s-maxage=1800` from `hot/route.ts:194` is a textbook
*web cache deception*. (verified)

---

## 4. Read-your-own-writes, and the failure that hides it

Jepsen: if a process writes *w* then reads *r*, *r* must observe *w* — a **session** guarantee that
says nothing about other processes. (documented) Optimistic UI forges it client-side, so an
unconfirmed write breaks it *silently*. `WorkBoard.tsx` does this three times, two correctly:

| Site | Shape | Detects rejection? |
|---|---|---|
| `:463-474` `updateTask`, `:477-485` `deleteTask` | `const { error } = await …`, restore snapshot | Yes (verified) |
| `:523-538` `onDragEnd` | `try { await … } catch { fetchTasks() }` | **No** (verified) |

`supabase-js` resolves with `{ data, error }` on an RLS or constraint rejection rather than throwing,
so `catch` fires only on a network-level rejection: a rejected move stays on screen looking saved
until reload. `05-optimistic-updates-rollback.md` owns the rollback mechanics.

**The multi-user half.** This board is not shared: `fetchTasks:302` filters
`.eq('user_id', user.id)`, and RLS grants `Users manage own work_tasks` for writes while admins get
`Work admins read all tasks` on SELECT only (`create-work-tables.sql:177-180`). Two people cannot
fight over one card here. The honest divergence pairs are **two tabs of one user** and **an admin
reading a board its owner is editing** — and the board carries no Realtime subscription at all, so
the admin's copy is frozen at page load while channels (`channels/page.tsx:199-213`) and DMs
(`messages/page.tsx:127-142`) both subscribe to `postgres_changes`. (verified)

### 4.1 The reorder is not commutative either

`onDragEnd:500-505` rebuilds the destination column from `tasksRef.current`, assigns absolute
`(i + 1) * 10` positions, and writes the dragged row at `:525-528` plus every sibling at `:530-534`.
Absolute positions from a private snapshot are the textbook non-commutative list edit: two concurrent
reorders write authoritative values over an overlapping row set, last-writer-wins per row, and the
merge is an interleaving neither chose — what list CRDTs exist to fix. (documented) A fractional
ordering key would write only the moved row. (inferred)

---

## 5. Broadcast: where "whose view is right" is live

`04-realtime-sync-consistency.md` owns the sync mechanics. The ownership question:

- **The writer set is not `broadcast_project_members`.** `trigger/route.ts:35` states its model in a
  comment — "session ID acts as capability token (no auth required)" — so the Stream Deck, the
  producer panel and anyone holding the session ID write with equal authority and no recorded
  identity; the rate limiter at `:28-33` is the only gate. Defensible for an OBS-driven surface, but
  "who changed this" is then unanswerable in principle, not merely unimplemented. (verified)
- **Per-key clobbering was already fixed, deliberately.**
  `scripts/broadcast-merge-active-state.sql` replaced a JS read-modify-write of the whole
  `active_state` object with an atomic top-level `jsonb ||` merge, naming the bug in its header and
  the production date, 2026-06 — the strongest concurrency work in the repo. It stops one level
  short: `visibleAssets` is still read at `:51-52` and written whole at `:397-400`, so two triggers
  racing on that key still last-writer-wins. (verified)
- **Reconnect never reconciles.** `useOverlaySession.ts:303-304` and `useProducerOverlay.ts:156-158`
  set only `connected: status === 'SUBSCRIBED'`, and Broadcast has no replay for messages missed
  while unsubscribed. (documented) Authoritative state sits in `broadcast_sessions.active_state`,
  fetched once at `useOverlaySession.ts:125` — the path exists, uncalled on resubscribe. (verified)

---

## What Triton should do, in order

1. **Move the `getCached` read in `/api/trends` after the tab branch, or put `tab` in the key.** One
   line; it fixes a live wrong-payload bug and makes two orphaned `setCache` writes reachable.
2. **Fix `WorkBoard.tsx:523-538`** to `const { error } = await …` with a snapshot restore, matching
   `:463-474`. Read-your-own-writes cannot hold while rejections are invisible.
3. **Add a shared `cacheHeaders.ts`** exporting `PUBLIC_DATA`, `BROWSER_ONLY` and
   `PRIVATE_NEVER_CACHE` (`private, no-store`), and lint literal `Cache-Control` strings out of
   `app/api/**` so a new identity-aware route inherits the safe default.
4. **Refetch authoritative state inside the `.subscribe()` callback** on `SUBSCRIBED` in
   `useOverlaySession` and `useProducerOverlay`; the fetch exists at `useOverlaySession.ts:125`.
5. **Subscribe `WorkBoard` to `postgres_changes` on `work_tasks`**, as `channels/page.tsx:199-213`
   already does, so a second tab and an admin viewer converge.

**Anti-recommendation: do not add `user_id` to the `queryCache` keys as a safety measure.** It looks
like diligence and is wrong three ways. (1) It fixes nothing — both consumers were verified to have
no user-varying input. (2) It destroys the cache: `trends:` and `mvpct:` entries each cost a
6-hour-TTL aggregate over `pitches`, so partitioning by user makes every first view a cold miss, the
cardinality mistake `movement-percentiles:30-35` already had to undo for velocity floats. (3) It
hides the real defect — the trends key is broken for omitting `tab`, and a second unused dimension
makes that harder to see. Scope keys to what the response depends on, nothing else.

**Highest-leverage next action:** move the `getCached` call in `app/api/trends/route.ts` below the
`tab === 'stuff'` and `tab === 'arsenal'` branches — a two-line diff that fixes a shipping
wrong-payload bug and is this doc's principle in its smallest form.

---

## Sources

1. [Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache) — §3's cacheable criteria, and the fact that only `s-maxage` gets a function response into the CDN.
2. [MDN — `Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) — the `public`/`private`/`no-store` distinction behind §3's caveat.
3. [MDN — HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching) — why cookies are not implicitly in a shared cache key.
4. [RFC 9111 §3, Storing Responses in Caches](https://www.rfc-editor.org/rfc/rfc9111.html#section-3) — when a shared cache may store an authenticated response.
5. [RFC 9111 §5.2.2, Response Directives](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2) — the directive semantics §3's caveat relies on.
6. [PortSwigger — Web cache deception](https://portswigger.net/web-security/web-cache-deception) — the attack class §3 audited for.
7. [Jepsen — Read Your Writes](https://jepsen.io/consistency/models/read-your-writes) — §4's session-scoped definition.
8. [Werner Vogels — Eventually Consistent](https://www.allthingsdistributed.com/2008/12/eventually_consistent.html) — session guarantees as client-side properties, which optimistic UI imitates.
9. [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) — why `work_tasks` is single-writer and the service role bypasses RLS.
10. [Supabase — Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast) — no replay for missed messages, the basis for §5.
11. [Supabase JS — `select()`](https://supabase.com/docs/reference/javascript/select) — the `{ data, error }` contract making `WorkBoard.tsx:523-538`'s `catch` dead code.
12. [TanStack Query — Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) — the "key includes every input the response depends on" rule, applied in §2.
13. [Kleppmann et al. — Moving Elements in List CRDTs](https://martin.kleppmann.com/papers/list-move-papoc20.pdf) — why delete-and-reinsert reordering fails to converge (§4.1).

**Triton-internal evidence.** Keys: `lib/queryCache.ts:16-26,68-81`;
`app/api/trends/route.ts:10,15-16,74,110,122` against `lib/hooks/useTrendsData.ts:110,173-176,197`;
`app/api/movement-percentiles/route.ts:30-35,43`; `lib/queryKeys.ts:1-45` (21 factories, no user id).
CDN audit, run 2026-08-21 over `app/api/**/*.ts`: 30 files set `Cache-Control`, 12 contain
`s-maxage`, 13 are `max-age`-only, 5 are `no-cache`/`no-store`; none set `Vary` or `private`; none
under `app/api/work`, `app/api/compete` or `app/api/broadcast` set it at all. The only
identity-aware members are `app/api/data-export/route.ts:292,375`,
`app/api/render-trends/route.ts:19-20` and `app/api/auto-compose/route.ts:22-23`, all `no-cache`;
`middleware.ts:70,75` exempts `/api/*`. Work: `components/work/WorkBoard.tsx:295-307,463-474,477-485,500-505,523-538`;
`scripts/create-work-tables.sql:177-180,229-240`; no `.channel(` in `components/work/**`, versus
`app/(work)/work/channels/page.tsx:199-213` and `app/(work)/work/messages/page.tsx:127-142`.
Broadcast: `app/api/broadcast/trigger/route.ts:28-33,35-52,395-400`;
`scripts/broadcast-merge-active-state.sql:1-17` (production 2026-06);
`lib/useOverlaySession.ts:125,303-304`; `lib/useProducerOverlay.ts:156-158`;
`lib/broadcast/checkProjectAccess.ts:9-36`; `lib/roles.ts:16-37`. Zero `version`/ETag/conflict
handling and zero `visibilitychange` listeners repo-wide; `lib/QueryProvider.tsx:15` sets
`refetchOnWindowFocus: false` against the packet's 9 `staleTime: Infinity` sites.
