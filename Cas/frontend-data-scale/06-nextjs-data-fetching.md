---
title: Next.js Data Fetching — Triton Runs the App Router and Opted Out of It
domain: frontend-data-scale
tags:
  - app-router
  - rsc
  - route-handlers
  - streaming
  - suspense
  - caching
  - react-query
  - next-16
sources_reviewed: 11
last_updated: 2026-08-21
---

# Next.js Data Fetching — Triton Runs the App Router and Opted Out of It

> Anchor doc for `frontend-data-scale/`. Grades: **(verified)** read at `file:line` or in the packet;
> **(documented)** vendor docs; **(inferred)** mechanism; **(cargo-cult)** unsupported. No production
> query run. Next **16.1.6**, React **19.2.3**, Vercel.

## TL;DR

- **Triton uses the App Router as a file-based router and little else** — 87 of 96 `page.tsx` are `'use client'`, data arriving via React Query against the repo's own 196 route handlers. That is coherent, not an accident: it buys filter interactivity RSC cannot. (verified)
- **Next's Data Cache is used exactly 15 times, all on third-party MLB API calls** — never Triton's own data, since `run_query` is a POST RPC and the Data Cache caches only GET `fetch`. (verified)
- **The real server cache is HTTP `Cache-Control`, hand-set in 30 route files** — Vercel's CDN, not Next, serves a warm `/api/player-data`. (verified)
- **Caching defaults inverted twice in two majors:** 14 cached by default, 15 stopped, 16 made it opt-in. Advice written before Oct 2024 is wrong here. (documented)
- **Zero `loading.tsx` means streaming has nowhere to land** — the body only streams once a Suspense fallback renders or a Server Component suspends, and the five `Suspense` sites are CSR bailouts. (verified)
- **Zero `error.tsx` means every render throw in 96 pages hits the framework default**, which draws its own document and never gets the dark theme. (verified)
- **`revalidate`, `fetchCache`, `unstable_cache`, `revalidateTag`, `'use server'`: zero uses** — no ISR, no tag invalidation, no Server Actions. (verified)
- **The best RSC migration here is the smallest one**: `loading.tsx` and `error.tsx` are the only files that change failure behavior. (inferred)

---

## 1. The inventory

| Feature | Triton | Note |
|---|---|---|
| `page.tsx` | 96 | 87 are `'use client'` |
| `layout.tsx` | 17 | 1 is a client component; none fetch data |
| `route.ts` under `app/api/` | 196 | plus one auth callback |
| `loading.tsx` | **0** | no route-level Suspense |
| `error.tsx` / `global-error.tsx` | **0** | no error boundary anywhere |
| `'use server'` | **0** | mutations go through route handlers |
| `next/cache` imports | **0** | no `unstable_cache`, `revalidateTag` |
| `'use cache'` / `cacheComponents` | **0** | Next 16's model unadopted |
| `generateStaticParams` / `revalidate` / `fetchCache` / `runtime` | **0** | |
| `export const dynamic` | 4 | all on pages, none on a handler |
| `export const maxDuration` | 20 | 300 s on long crons |
| `fetch(…, { next: { revalidate } })` | 15 / 13 files | all third-party |
| Hand-set `Cache-Control` | 30 files | the real server cache |

The root layout is a Server Component that immediately nests five client providers
(`app/layout.tsx:47-58`); everything below that line is client. (verified)

---

## 2. Caching semantics changed twice; know which version you are reading

| Behavior | Next 14 | Next 15 | Next 16 (Triton: 16.1.6) |
|---|---|---|---|
| `fetch()` default | cached (`force-cache`) | **uncached** | uncached; opt in via `use cache` |
| GET route handler | cached unless dynamic | **uncached** | uncached |
| Router Cache, page segments | 30 s | **`staleTime: 0`** | rewritten prefetcher, layout dedup |
| Opt-in primitive | `revalidate` / `unstable_cache` | same | **`'use cache'` + `cacheComponents`** |
| `revalidateTag(tag)` | 1 arg | 1 arg | **needs a `cacheLife` profile**; 1-arg deprecated |

**The Next 16 route-segment-config reference no longer lists `dynamic`, `revalidate`, or
`fetchCache`** — removed once `cacheComponents` is on, surviving only in a legacy guide. Triton's
four `export const dynamic` sit on that path. (documented)

**The zero-`revalidate` posture is correct-by-accident on 15/16 and would have been a live bug on
14**, where a GET handler with no dynamic function froze at build time. The crons dodge it anyway by
reading `req.headers` for the `CRON_SECRET` bearer (`app/api/cron/pitches/route.ts:21-24`). (inferred)

---

## 3. Route handlers: HTTP headers are the real server cache

`app/api/player-data/route.ts` is the load-bearing case: no segment config, a `run_query_long` RPC,
and one hand-written header — `'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600'`
(`:54-56`). That 300 s matches `QueryProvider`'s 5-minute `staleTime` exactly; CDN and browser tiers
expire together. The string recurs in `sequencing`, `pitcher-outing`, `models/matchup`; slower routes use
`max-age=3600, stale-while-revalidate=86400`. (verified)

**This is Next's cache bypassed, not ignored.** Triton's own data *cannot* enter the Data Cache:
`supabase-js` issues RPCs as POSTs, and only GET `fetch` is cached. The 15 `next: { revalidate: N }`
sites are all outbound GETs to `statsapi.mlb.com` — 15 s `live-game`, 300 s `standings`, 86400 s
`game/player-meta`. That is Next's entire caching footprint in a 196-route app. (verified)

How the DB-backed `lib/queryCache.ts` (6 h TTL, `invalidateBySource`) behaves is `caching-state/`'s
subject; the Next-facing fact is why it exists. **A POST-shaped data layer is invisible to the Data
Cache, so the cache was rebuilt one layer down.** (inferred)

---

## 4. The RSC boundary: what 87-of-96 client pages buys and costs

The nine Server Component pages have no interactivity to lose: static shells, redirects, and four
`app/(data)/**` admin pages that `await` Supabase counts under `dynamic = 'force-dynamic'`
(`app/(data)/data/page.tsx:2-17`). Only `app/landing/[slug]/page.tsx:6-10` uses the Next 15/16 async
`params` API. (verified)

| | Client-fetch (today) | RSC fetch-on-server |
|---|---|---|
| Filter chip response | instant, in-memory over ≤50k rows | round-trip per change |
| First paint | shell → spinner → data | data in the first HTML |
| JS shipped | page + Plotly + filter engine | less, when the page is inert |
| Cache that applies | React Query + CDN headers | Data Cache (GET `fetch` only) |

Triton picked the right side here: a dashboard re-querying an 8.88M-row table (packet, `reltuples`,
stale planner stats — approximate) on every chip toggle, under an 8 s statement cap, is worse on
every axis the operator cares about. TanStack's own guidance matches — treat Server Components as
"a place to prefetch data, nothing more," and do not split data ownership across the boundary. The
cost is not correctness but **failure behavior** (§5, §6); bundle sizing is `04-*` and `10-*`.
(documented)

---

## 5. Streaming has nowhere to land

`loading.js` "will automatically wrap the `page.js` file and any children below in a `<Suspense>`
boundary," and the docs name the trigger precisely: *"The response body starts streaming when a
Suspense fallback renders … or when a Server Component suspends under a `Suspense` boundary."*
Triton has zero `loading.tsx`, and with 87 of 96 pages client-side nothing on the server suspends.
**Streaming is not slow here; it is absent.** (documented + verified)

The five `Suspense` uses are a different mechanism: each wraps a client component calling
`useSearchParams` (`app/(research)/reports/page.tsx:930`, `app/(auth)/login/page.tsx:89`, three
more) behind a blank `min-h-screen bg-zinc-950` div. That is the prerender bailout Next requires; it
streams and shows nothing. (verified)

One `app/loading.tsx` would change navigation even so: Next prefetches the fallback, so a transition
paints a skeleton instead of blocking on the client bundle. It does **not** cover uncached data
access in its own segment's `layout.js` — but Triton's layouts fetch nothing. (documented)

---

## 6. No error boundary anywhere

`error.tsx` "wraps a route segment and its nested children in a React Error Boundary," must be a
Client Component, and does **not** catch errors in its own segment's `layout.js` — that is
`global-error.tsx`. Triton has zero of both, so any throw in any of 96 pages reaches Next's built-in
fallback. Two specifics to know before you see it live:

- The built-in 500 page and `global-error` **draw their own document and omit global styles**, so the
  `dark` class set at `app/layout.tsx:40-44` never reaches them — the operator's first sight of a
  Triton error is a light-themed page. (documented + verified)
- Server Component errors are **not** forwarded verbatim in production — only a generic message plus
  `error.digest`, the hash matching server logs. With no `error.tsx` logging `digest`, a server
  render failure leaves no client-side trace. (documented)

Next 16.3 stabilized a `retry()` prop superseding `reset()`; on 16.1.6 write `reset()`, swap on
upgrade. (documented)

---

## 7. Config that is load-bearing and version-sensitive

`next.config.ts` is 16 lines and every one earns its place (`:4-13`). **`turbopack: { root: __dirname }`**
is pinned because a stray `~/package-lock.json` made Next infer `/Users/trevor` as workspace root;
Turbopack then resolved `node_modules` from the wrong place and pages hung. Turbopack is the
**default** bundler in 16, so that pin now affects every build, not only `--turbo`.
**`middlewareClientMaxBodySize: '500mb'`** covers bodies through `middleware.ts`;
**`serverExternalPackages: ['@napi-rs/canvas']`** keeps a native module unbundled. (verified)

`middleware.ts:4-14` runs `updateSession` (Supabase SSR cookie refresh) on nearly every path.
**Next 16 deprecates the `middleware.ts` filename in favor of `proxy.ts`** on the Node.js runtime;
the rename is mechanical (`middleware` → `proxy` export). Do it in a quiet week, alone. React
Compiler went stable in 16 but is **not on by default**, and Triton disabled it after state-reset
bugs — settled, not an unclaimed win. (documented)

---

## 8. What Triton should do, in order

1. **Add `app/error.tsx` and `app/global-error.tsx`** — dark-themed client components logging
   `error.digest`. The only change that alters what a user sees when something breaks.
2. **Add `app/loading.tsx`,** a `zinc-950` skeleton: Next prefetches the fallback, so transitions
   paint instantly with no data-fetching change. Then per-area under `(research)`, `(broadcast)`.
3. **Give the heavy surfaces their own `error.tsx`** — `app/player/[id]/`,
   `app/(research)/reports/`, `app/(broadcast)/broadcast/[projectId]/`.
4. **Settle the `dynamic` question.** Keep the four on `app/(data)/**`; never add it to a route
   handler, where it is a no-op that reads as intent — GET handlers are uncached by default since 15.
5. **Rename `middleware.ts` → `proxy.ts`.** Deprecated in 16, no behavior change now.
6. **Write down the header contract.** Move the four `Cache-Control` profiles into one module so a
   route's CDN tier is declared, not retyped across 30 files.
7. **Leave `cacheComponents` / `'use cache'` alone,** but re-read before the next major — migrating
   from a repo with no `revalidate` exports is cheaper than from one with fifty.

**Anti-recommendation: do not rewrite the analyst dashboards as Server Components.** Three
independent grounds. *Interactivity* — up to 50,000 rows (`app/api/player-data/route.ts:44`) sit in
browser memory and every chip filter is a synchronous array pass; server-side filtering turns a 0 ms
interaction into a round-trip, and under the 8 s `authenticator` cap some of those fail outright.
*Caching* — RSC buys nothing from the Data Cache, whose GET-`fetch`-only rule cannot see a POST RPC,
so the CDN headers and React Query must be rebuilt anyway. *Blast radius* — a 355-file `'use client'`
estate with no `error.tsx` and no golden-file tests on metric output moves failures from somewhere
the operator can see to somewhere he cannot. Whether the data is present is `Jo/`'s question and
whether the number is defensible is `Li/`'s; neither improves by moving the render.

**Highest-leverage next action:** create `app/error.tsx` and `app/global-error.tsx` today — one
afternoon converts every unhandled throw across 96 pages from an unbranded dead end that discards the
server error message into a logged, recoverable, dark-themed screen.

---

## Sources

1. Vercel — [Next.js 16 notes](https://nextjs.org/blog/next-16) — Cache Components, `proxy.ts`, `revalidateTag`, top-level `turbopack`; §2, §7.
2. Vercel — [Next.js 15 notes](https://nextjs.org/blog/next-15) — the caching break in its own words; §2's middle column.
3. Next.js — [Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config) — the current option table, minus `dynamic`/`revalidate`.
4. Next.js — [`route.js`](https://nextjs.org/docs/app/api-reference/file-conventions/route) — what a route handler can and cannot cache; §3.
5. Next.js — [`'use cache'`](https://nextjs.org/docs/app/api-reference/directives/use-cache) — the opt-in primitive Triton never uses.
6. Next.js — [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) — the flag retiring the legacy segment options.
7. Next.js — [`loading.js`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) — implicit Suspense wrap, layout caveat; §5.
8. Next.js — [Streaming](https://nextjs.org/docs/app/guides/streaming) — when the body actually starts streaming.
9. Next.js — [`error.js`](https://nextjs.org/docs/app/api-reference/file-conventions/error) — bubbling, `global-error` styling, `digest`, `retry()`; §6.
10. Next.js — [`useSearchParams`](https://nextjs.org/docs/app/api-reference/functions/use-search-params) — the bailout behind Triton's five `Suspense` sites; §5.
11. TanStack Query — [Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) — its warning against split data ownership; §4.

**Triton-internal evidence (repo read 2026-08-21 at commit `6555039`; no production query).** By `find`/`grep` over `app/`, `lib/`, `components/`: 96 `page.tsx`, **87** with `'use client'`; 17 `layout.tsx`, 1 with; **196** `route.ts` under `app/api/`; **0** `loading.tsx`/`error.tsx`/`global-error.tsx`/`not-found.tsx`/`template.tsx`/`default.tsx`; **0** `next/cache` imports, **0** `'use server'`, **0** `generateStaticParams`, **0** `revalidate`/`runtime`/`fetchCache` exports; **4** `dynamic = 'force-dynamic'`, all under `app/(data)/**`; **20** `maxDuration`; **30** files setting `Cache-Control`; **15** `next: { revalidate }` sites in 13 files. Header `app/api/player-data/route.ts:55`, `LIMIT 50000` `:44`. `lib/QueryProvider.tsx:12-15` (`staleTime` 5 min, `gcTime` 10 min, `retry: 1`, `refetchOnWindowFocus: false`), 9 import sites (packet); `lib/hooks/useStandings.ts:25` overrides to `staleTime: Infinity` for closed seasons. Root layout `app/layout.tsx:35-63`, theme script `:40-44`, providers `:47-58`. `Suspense` at `app/(research)/reports/page.tsx:930`, `app/(milb)/milb/reports/page.tsx:826`, `app/(visualize)/visualize/[template]/page.tsx:271`, `app/(auth)/login/page.tsx:89`, `app/(launcher)/page.tsx:248`; 8 files use `useSearchParams`. Async `params` `app/landing/[slug]/page.tsx:6,9-10`. `next.config.ts:4-13`; `middleware.ts:4-14`. Cron auth `app/api/cron/pitches/route.ts:21-24`, `maxDuration` `:9`; UTC schedules in `vercel.json`. `package.json`: Next **16.1.6**, React **19.2.3**, `@tanstack/react-query` **^5.100.10**; React Compiler disabled for state-reset bugs (packet). `pitches` ≈ **8.88M rows / 9.7 GB** and the 8 s `authenticator` cap are packet figures (2026-08-12, `reltuples`, stale planner stats — approximate).

