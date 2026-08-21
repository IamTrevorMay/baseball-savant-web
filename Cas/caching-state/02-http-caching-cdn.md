---
title: HTTP Caching & the CDN — Thirty Routes Guessing at the Same Contract
domain: caching-state
tags:
  - http-caching
  - cache-control
  - cdn
  - vercel
  - stale-while-revalidate
  - cache-keys
  - purging
sources_reviewed: 10
last_updated: 2026-08-21
---

# HTTP Caching & the CDN — Thirty Routes Guessing at the Same Contract

> Layer 2 of Triton's four caching layers. Grades: **(verified)** read at `file:line`;
> **(documented)** RFC or vendor docs; **(inferred)** reasoned from both; **(cargo-cult)** copied
> without support. No database query, no live HTTP probe. Next's Data Cache is out of scope
> (`Cas/frontend-data-scale/06-nextjs-data-fetching.md`).

## TL;DR

- **`max-age` addresses the browser; `s-maxage` addresses the CDN. Vercel will not cache a function response carrying only `max-age`** — every entry in its list of qualifying directives contains `s-maxage`. (documented)
- **13 of Triton's 30 `Cache-Control` routes set `max-age` with no `s-maxage`, and they are the analytics routes** — `player-data`, `trends`, `scene-stats`, `league-baseline`, `movement-percentiles`, `sequencing`, `pitcher-outing`. Each re-runs its Postgres aggregation for every cold browser. (verified)
- **The 10 routes that do reach the CDN are the puzzle game and the news feeds** — the cheap responses are edge-cached; the 8-second ones are not. (verified)
- **`stale-while-revalidate` is Triton's most-used directive and is inert at 15 of its 28 sites** — no stored edge copy means no stale copy to serve. Where it does work, it is the one directive that deliberately hands a user a value known to be out of date, honest only if the surface can say so. No Triton surface can. (verified)
- **There is no purge handle in the repo** — zero `Vercel-Cache-Tag`, `addCacheTag`, `revalidateTag`, and tags are Vercel's only programmatic purge path, so a `stale-while-revalidate=3600` window cannot be cut short when data lands. (verified)
- **The overlay is where the header is the whole contract** — OBS loads it as embedded Chromium with no user and no mid-show refresh, and every `/api/broadcast/*` route sets no `Cache-Control` at all: right, by omission. (verified)
- **Triton emits no `Age` header and no in-body generation timestamp on any cached route.** `Age` and `Date` are the standard way a response states its own age — one line per route, not a redesign. (documented)
- **A 5-minute TTL on a source 46 days stale is a rounding error.** TTL tuning is downstream of source freshness — Jo's lane, `Jo/data-reliability/`. (verified)

---

## 1. Two audiences, two directives

Every directive is addressed to a **shared cache** (RFC 9111 §1.3: "stores responses for reuse by
more than one user … as part of an intermediary" — here, Vercel's CDN), a **private cache**
("dedicated to a single user" — the browser), or both. Triton's route files disagree about which.

| Directive | Audience | Meaning | On Vercel |
|---|---|---|---|
| `max-age=N` | both; overridden for shared | stale once age > N s (§5.2.2.1) | **CDN does not cache**; browser N s |
| `s-maxage=N` | shared only | "for a shared cache … overrides the maximum age specified by either the max-age directive or the Expires header field" (§5.2.2.10) | CDN caches N s |
| `stale-while-revalidate=Z` | any | caches "MAY serve the response … after it becomes stale" and "SHOULD attempt to revalidate it while still serving stale responses" (RFC 5861 §3) | only alongside `s-maxage` |
| `no-cache` / `no-store` | any | revalidate before reuse / "MUST NOT store any part" (§5.2.2.4–5) | CDN refuses to store |
| `proxy-revalidate`, `stale-if-error` | shared / any | — | **unsupported** |

The load-bearing sentence is Vercel's, not the RFC's: *"To cache the response of Functions on
Vercel's CDN, you must include `Cache-Control` headers with **any** of the following directives:
`s-maxage=N`; `s-maxage=N, stale-while-revalidate=Z`; …"* — `max-age` appears in none of the three
listed forms. Vercel then rewrites what the browser sees, stripping *"`s-maxage` and
`stale-while-revalidate` from the response before sending it to the browser"* and substituting
`public, max-age=0, must-revalidate` where `s-maxage` was the only freshness directive. Triton's two
big classes are mirror images: `max-age`-only caches in the browser and never at the edge;
`s-maxage`-only at the edge and never in the browser. (documented)

---

## 2. Triton's 30 routes, sorted by who actually caches them

37 header sites, 30 files, **15 distinct strings**, no shared constant. (verified)

| Class | String | Files | CDN | Browser |
|---|---|---|---|---|
| **A. `max-age` only — 13 files** | `public, max-age=300, stale-while-revalidate=3600` | 6 | **no** | 5 min |
| | `public, max-age=3600, stale-while-revalidate=86400` | 5 | **no** | 1 h |
| | `public, max-age=3600` · `public, max-age=600, swr=3600` | 2 | **no** | 10 min–1 h |
| **B. `s-maxage` only — 10 files** | `s-maxage=1800, stale-while-revalidate=300 / 3600` | 4 | 30 min | no |
| | `s-maxage=` 300 / 86400 / 3600 / 30 / `${ttl}`, all with SWR | 6 | 30 s–24 h | no |
| **C. both — 2 files** | `public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800` | 2 | 24 h | 24 h |
| **D. uncacheable — 5 files** | `no-cache` ×3 · `no-store` ×1 · `no-store, no-cache, must-revalidate, proxy-revalidate` ×1 | 5 | no | no |

**Class A is the analytics platform** — every route issuing a `run_query` RPC against the 7.4M-row
`pitches` table, headed by `app/api/player-data/route.ts:55`. What those headers buy: a browser that
skips the request for 5 minutes on a warm tab. What they do not buy: any sharing between users, any
protection for Postgres, or any effect at all from the `stale-while-revalidate=3600`. (verified)

**Class B is the game and the feeds** (`app/api/game/*`, `bat-tracking`, `hot`, `news`, `milb/news`)
— cheap responses, correctly edge-cached, and `game/puzzle/route.ts:34-35` holds the repo's best TTL:
it interpolates `ttl = secondsUntilReset()`, so the entry expires when the puzzle rolls over.
**Class C is the two image generators** (`card-image:29`, `daily-graphics:124`), the only
correct two-tier shape here: 24 h edge, 24 h browser after the strip, a week of SWR. **Class D**
carries the repo's only unsupported directive — `emails/track/open/route.ts:47` sends
`proxy-revalidate` on a route already `no-store`. (cargo-cult)

---

## 3. `stale-while-revalidate`: most used, least stated

SWR's contract is explicit: the cache serves a response *it knows is stale* and refreshes in the
background. Good trade for analytics — but it turns a freshness question into a **display** question,
and Triton answers neither. At the 15 class-A sites it does nothing; at the 13 class-B/C sites it
works as specified; on zero surfaces is it visible.

Vercel already publishes the answer: `x-vercel-cache` returns `HIT`, `MISS`, `STALE`, `PRERENDER`,
`REVALIDATED`, or `BYPASS`, and `STALE` means *"a cached response was served while Vercel refreshed it
in the background."* Nothing in the repo reads it. (verified)

This is hazard #5 of `Cas/context/triton-context.md` seen from the transport layer.
`system_metadata.mv_last_refreshed` is read by three server files (`admin/cron-health/route.ts:44`,
`cron/refresh/route.ts:140`, the pitches cron) and by **zero UI components**. The staleness signal
exists at both the HTTP layer and the data layer, and neither reaches a pixel. Affordance design:
`Cas/analytics-ux/08-loading-empty-error-states.md`; the value to bind it to lives here.

**Cas's rule: a cached response must be able to state its age.** RFC 9111 §5.1 defines `Age` as "the
sender's estimate of the time since the response was generated or successfully validated at the
origin server." Triton sends no `Age` and no in-body timestamp; the only route that stamps its output
is `admin/cron-health/route.ts:58` (`fetchedAt`), which no dashboard reads. (verified)

---

## 4. Cache keys, `Vary`, and the purge that isn't there

Vercel derives the CDN key from request method · request URL · host domain · **the unique deployment
URL** · scheme, and states *"cache keys are not configurable. To purge the cache you must configure
cache tags."* Tags arrive via a `Vercel-Cache-Tag` header, `addCacheTag()`, or `cacheTag()`, and are
purged through `revalidateTag`, `invalidateByTag`, `vercel cache invalidate`, or REST
`/invalidate-by-tag`. **Triton uses none of the three tagging mechanisms and none of the four purge
paths**, so its only purge is the dashboard's `*` wildcard. (verified + documented)

Three consequences. **Every deploy is an implicit full purge**, since the key contains the deployment
URL — at 121 commits in 90 days the real TTL ceiling is the deploy interval, not the header.
(inferred) **`Vary` is absent repo-wide**, harmless today, but `lib/supabase/middleware.ts:62-64` sets
`x-triton-public` for `public.tritonapex.io`, so `Vary: x-triton-public` must land *with* any future
`s-maxage`, not after. (inferred) **Nothing invalidates the CDN on ingest**:
`queryCache.ts:68-72,79-84` deletes `trends:`/`mvpct:` rows for `'pitches'` only, under a bare
`.catch(() => {})`, and tells the edge nothing. (verified)

---

## 5. The overlay: when a header is the whole contract

`app/overlay/[sessionId]/page.tsx` is `'use client'`, renders 1920×1080 transparent, and is loaded by
OBS as an embedded-Chromium browser source — no keyboard, no devtools, no user watching a spinner.
Its only cache-control surface is what the server sent.

A CDN-cached **JSON analytics response** five minutes stale gives a slightly old number to someone
reading a screen. A CDN-cached **overlay payload** five minutes stale gives a confidently wrong
graphic on air while the producer's panel shows the right value on another machine. Not degraded —
contradictory. Triton gets this right by omission: **no route under `app/api/broadcast/` sets
`Cache-Control`**, and Vercel caches nothing without `s-maxage`, so the boot fetches at
`lib/useOverlaySession.ts:125,135` always hit origin. (verified) Write that down before someone
optimizes it — a well-meant `s-maxage=60` on `/api/broadcast/sessions` puts a stale asset list in
front of a camera.

---

## 6. What Triton should do, in order

1. **Add `Age` and an `x-cache-generated` timestamp to the class-A analytics routes**, and surface
   `mv_last_refreshed` beside any number derived from it. One header per route, no behavior change,
   and every later staleness claim becomes checkable from devtools.
2. **Pick one route — `/api/league-baseline` — and give it `s-maxage`.** Its data changes nightly at
   most and every plus-stat surface reads it. `public, max-age=300, s-maxage=3600,
   stale-while-revalidate=86400` leaves browser behavior identical and adds the edge. Read
   `x-vercel-cache` before widening.
3. **Create `lib/cacheHeaders.ts` with four named profiles** (`LIVE`, `SESSION`, `DAILY`,
   `IMMUTABLE`) and migrate the 15 strings onto them. 15 strings over 30 files is a config surface
   nobody can audit.
4. **Set `Vercel-Cache-Tag` — and `Vary: x-triton-public` — on any route the moment it gains
   `s-maxage`**, tagged by source table, so the cron can call `invalidateByTag` beside
   `invalidateBySource`.

**Anti-recommendation: do not "fix" class A by bulk-adding `s-maxage` to all 13 routes.** It fails on
three independent grounds. *(a) Correctness:* those routes are parameterized by pitcher, season, and
filter set, so the edge fills with low-hit-rate entries that Vercel warns "may be evicted from the
regional cache" regardless of TTL. *(b) Invalidation:* with no cache tags there is no way to cut a
`stale-while-revalidate=3600` window short, so one bad ingest is visible on every screen for an hour
with no lever to pull — strictly worse than today, where a refresh fixes it. *(c) Priority:*
`planning.md:301` records `league_averages` 46 days stale behind a refresh chain dead since
2026-06-26; shaving 300 ms off delivery of a 46-day-old number is not a caching win. Fix the source
first — `Jo/data-reliability/`, not Cas.

**Highest-leverage next action:** add `Age: 0` plus an `x-cache-generated` ISO timestamp to
`app/api/player-data/route.ts:55`, read it in the player dashboard's fetch layer, and render it as an
"as of HH:MM" line. Under an hour of work, it is the first time any Triton surface can state the age
of what it shows, and it turns every later caching decision from an argument into a measurement.

---

## Sources

- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html) — quoted text for `max-age`, `s-maxage`, `no-store`, the shared-vs-private split, and `Age`.
- [RFC 5861: Cache-Control Extensions for Stale Content](https://www.rfc-editor.org/rfc/rfc5861.html) — the `stale-while-revalidate` definition Triton relies on at 28 header sites.
- [Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache) — the qualifying-directive list that makes the `max-age`-only claim checkable, plus the `s-maxage` strip and `Vary` handling.
- [Purging Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache/purge) — cache-key composition and the four tag-based purge paths Triton uses none of.
- [Vercel: Response headers](https://vercel.com/docs/headers/response-headers) — the `x-vercel-cache` values and the client-facing rewrite to `public, max-age=0, must-revalidate`.
- [Vercel: Cache-Control headers](https://vercel.com/docs/caching/cache-control-headers) — the `CDN-Cache-Control` split for setting browser and edge TTLs independently.
- [RFC 9213: Targeted HTTP Cache Control](https://httpwg.org/specs/rfc9213.html) — the standard behind `CDN-Cache-Control`, the clean fix for the browser-vs-edge TTL conflict.
- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) — the browser-compatibility table for `stale-while-revalidate`, which decides whether class A's SWR does anything.
- [MDN: Age](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Age) — the header Triton should emit; seconds since generation, not since receipt.
- [OBS: Browser Source](https://obsproject.com/kb/browser-source) — confirms the overlay client is embedded Chromium whose only cache recovery is a manual refresh.

**Triton-internal evidence.** Re-measured from the repo on 2026-08-21 at commit `d6147f0`; no database
queried, no live HTTP request made. `grep -rn "Cache-Control" app` returns **37 header sites across 30
files, 15 distinct strings**. **13 files with `max-age` and no `s-maxage`**: `player-data:55`,
`trends:19,75,111,125`, `scene-stats:1688`, `league-baseline:94`, `movement-percentiles:47,104`,
`player-filter-options:38`, `sequencing:78`, `sequencing-atbats:42`, `pitcher-outing:64,238`,
`models/matchup:183`, `team-tendencies:284`, `imagine/heatmap-data:68`, `local-media:102,114`. **10
with `s-maxage` and no `max-age`** (`bat-tracking:88`, `hot:57,194`, `news:48`, `milb/news:46`, six
under `app/api/game/`, incl. `puzzle:35`), **2 with both** (`card-image:29`, `daily-graphics:124`),
**5 uncacheable** (incl. `emails/track/open:47`). Zero repo-wide occurrences of `Vary`,
`CDN-Cache-Control`, `Vercel-Cache-Tag`, `addCacheTag`, `cacheTag`, `revalidateTag`, `revalidatePath`;
no `headers()` in `next.config.ts`; zero `Cache-Control` under `app/api/broadcast/`.
`lib/queryCache.ts:68-72,79-84` is the platform's only invalidation, called with `'pitches'` alone
from `app/api/cron/pitches/route.ts:66-70` and `cron/refresh/route.ts:161-165`.
`system_metadata.mv_last_refreshed`: 3 server files, 0 components. Deploy proxy:
`git log --since="90 days ago" --oneline | wc -l` = **121** (30-day: 12).
