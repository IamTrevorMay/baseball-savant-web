---
title: Integration & E2E Testing — Proving the Producer and the Overlay Still Agree
domain: testing-data-systems
tags:
  - integration-testing
  - e2e
  - playwright
  - realtime
  - broadcast-overlay
  - route-handlers
  - flake-management
sources_reviewed: 21
last_updated: 2026-08-12
---

# Integration & E2E Testing — Proving the Producer and the Overlay Still Agree

## TL;DR

- **Two of eight producer presets push empty panels to air.** `fetchArsenal`/`fetchMovement` read `json.pitches`; `/api/scene-stats?kinematics=true` returns `{ kinematics: … }`. Both resolve to `[]`: a titled empty box, live. **(verified)**
- **The wire contract is a TypeScript union nothing imports.** `BroadcastEventType` declares 21 events; `video:play`/`video:stop` have no sender or listener, `ad:ended` and `clip:marker-update` are on the wire but undeclared, and all 28 `.on()` sites use string literals with `payload: any`. **(verified)**
- **The only "API-route test" imports no route, and nothing runs `npm test` anyway.** `__tests__/api/playerData.test.ts` re-declares `prefixColumns` and asserts against its own copy; no test imports a handler from `app/api/**`; the one workflow is `retro-ingest.yml`, so failures are permanent by construction. **(verified)**
- **The suite is red in two places, and the second is drift.** 5 of 122 fail: 4 in `queryCache.test.ts` (mock lacks `.maybeSingle()`), 1 in `leagueStats` expecting `Infinity` from `computePlus(91,90,0)` — the code grew a guard returning `100`, the test never followed. **(verified)**
- **Two config lines fake the rest of the coverage.** `setupFiles: ['dotenv/config']` loads a `.env` absent here, so `savantValidation`'s `describe.skipIf(!hasEnv)` skips 24 provider-contract tests; `environment: 'node'` leaves no line of overlay rendering testable — no jsdom, Testing Library, or Playwright in `package.json`. **(verified)**
- **`await channel.subscribe()` awaits a non-Promise, and `send()` without `ack: true` resolves without server receipt.** Every "the event was sent" assertion here is unfalsifiable. **(verified + documented)**
- **The producer overlay cannot survive an OBS browser-source refresh; the main overlay can.** `ActiveState` has no panel fields and `useProducerOverlay` never reads it — one reload leaves the two 1920×1080 outputs disagreeing for good. **(verified)**
- **The highest-value harness is two Supabase clients in Node, not two browsers.** Every defect found by reading was data-shaped; browsers buy pixels, the layer that flakes. **(inferred)**
- **Retrying to green is the one anti-pattern this system cannot afford** — a broadcast defect gets one live take, and a test that passes on attempt three is telling you the bug is intermittent, which is worse. **(cargo-cult)**

---

## 1. Three seams, three technologies

"Integration test" collapses three problems. Separate them before choosing tools.

| Seam | What breaks | Cheapest honest test | In repo |
|---|---|---|---|
| **Route handler** | params, status codes, SQL shape, response **keys** | import it, pass a `NextRequest`, mock `supabaseAdmin` | none |
| **Realtime wire** | event names, payload shape, ordering, ack, reconnect | two `supabase-js` clients, one channel, in Node | none |
| **Rendered overlay** | 1920×1080 layout, transparency, animation phase, legibility | headless Chromium, two contexts, clipped screenshots | none |

**Every defect this doc found by reading lives in seam 1 or 2** — response keys, a missing JSON-column field, string literals. Build seams 1–2 first; seam 3 stays thin.

Realtime *semantics* (delivery guarantees, ordering, conflict resolution, what "connected" means) belong to `caching-state/04-realtime-sync-consistency.md`; this doc only proves the code obeys them. Provider drift: `03-contract-testing-external-apis.md`; CI: `10-ci-cd-for-data-apps.md`; Supabase mocks: `11-vitest-nextjs-patterns.md`.

---

## 2. What the suite actually is (measured 2026-08-12)

Run `npm test` before believing any prior description: `Cas/context/triton-context.md` is one failure out of date.

```
Test Files  2 failed | 4 passed | 1 skipped (7)
     Tests  5 failed | 93 passed | 24 skipped (122)     Duration 222ms
```

| File | State | What it tells you |
|---|---|---|
| `lib/queryCache.test.ts` | 4 failed / 6 | Mock chain stops at `.gt()`; `getCached` throws — masks real cache regressions. |
| `lib/leagueStats.test.ts` | 1 failed / 44 | Asserts `computePlus(91,90,0) === Infinity`; `lib/leagueStats.ts:1320` returns `100`. **Test wrong, code right** — drift. |
| `api/playerData.test.ts` | 5 passed | Tests a copy of the route's logic, not the route. |
| `integration/savantValidation.test.ts` | 24 skipped | Guarded on env the setup file cannot load. |
| `sql`, `outingCommand`, `reportQueryBuilder` | passing | Real unit coverage, the honest part. |

**(i)** The 222 ms runtime is the tell — nothing crosses a process boundary, so nothing here is an integration test. **(ii)** A red suite with no CI gate becomes a changelog — **already red, it cannot notice one more failure**.

---

## 3. Seam 1 — route handlers, starting at `/api/broadcast/trigger`

App Router handlers are plain functions over `Request`/`Response`: import and call them under Vitest, no server, no port (documented). Of **195 route handlers** none is tested; `app/api/broadcast/trigger/route.ts` earns the first, on four grounds: a pure `GET` over query params; the Stream Deck / hotkey path, fired under time pressure with nobody at a console; session id as **capability token** (`:35–44`, no auth), so validating it *is* the security; and a status vocabulary worth pinning.

| Case | Expected | Why it matters live |
|---|---|---|
| missing `sid` or `action` | 400 | A bad Stream Deck button should say so, not no-op |
| `action` outside the 19-item union | 400 listing valid actions | Renames are the likeliest regression |
| `aid` missing for an aid-required action | 400 | Half the actions take it, half don't; the split is a literal array |
| unknown `sid` | 404 | Typo vs dead session |
| `is_live === false` | 409 | The overlay is not listening; a silent 200 lies |
| 61st request in 60 s | 429 + `Retry-After` | `checkRateLimit(sid, 60, 60_000)` is in-memory, per instance |
| `producer_panel_show` without `content` | 400 **and** channel removed | `removeChannel` on early returns — easy to drop in a refactor |

Copy that row's shape: assert **cleanup**, not status alone. Mock `supabaseAdmin` so `.channel()` returns a recorder with `subscribe`/`send`/`removeChannel` spies, then assert it fires on every exit. This bug class ships and hides — `/api/admin/backfill-stuff-plus` was broken for months for it.

**Encode this, the code is wrong about it:** the handler `await`s `channel.subscribe()` before sending (`:64–65`, `:120–121`, `:189`), but `subscribe()` returns `RealtimeChannel`, not a Promise (`realtime-js` `RealtimeChannel.d.ts:185`), so the await yields on a microtask, long before the socket joins. Sending before subscribing falls back to HTTP (documented) — it works, by a transport nobody intended. A test asserting subscription status *before* `send` fails today.

---

## 4. Seam 2 — the Realtime wire, which TypeScript is not checking

### 4.1 The contract that isn't

`BroadcastEventType` (`broadcastTypes.ts:194`) and `BroadcastEvent` (`:217`) are imported nowhere in `app/`, `lib/`, `components/` (verified) — documentation, not enforcement, decayed both ways. All 28 `.on()` registrations repo-wide are string literals with `payload: any`.

Two fixes, order mattering. **Type-level:** export `BROADCAST_EVENTS`, derive the union, use it at every `.on`/`.send` — that catches typos. **Test-level:** a table test over the constant asserting each event has ≥1 listener and ≥1 sender — only that catches listener *deletion*, what refactors actually do.

### 4.2 A producer/overlay harness without a browser

The hooks are the wrong seam (React state machines coupled to `fetch`, `createClient`, `setTimeout`); **the payload** is right. Extract the eight fetchers in `lib/useProducerControls.ts` into a testable module and assert:

1. **Response-key contract** — each fetcher's expected shape matches its route's response. Catches the live bug: `fetchArsenal`/`fetchMovement` read `json.pitches` (`:201`, `:224`), the route returns `{ kinematics: data }` (`scene-stats/route.ts:1527`). Sibling `visualize/pitch-lab` reads `data.kinematics` correctly — the fix is known, only this path was untested.
2. **Renderer precondition** — `ArsenalRenderer` calls `data.pitches.sort((a,b) => b.usage_pct - a.usage_pct)` and `p.usage_pct.toFixed(0)`; the kinematics query returns no `usage_pct`. A fixture round-tripped fetcher → `PanelContent` → renderer props fails first run.
3. **Payload budget** — Realtime broadcast caps at 3,000 KB on Pro+, 500 msg/s, 100 channels per connection (documented). `fetchMovement` maps every row into panel content; assert a serialized-size ceiling per preset so a per-pitch query cannot silently blow the channel.

Then the wire test, no browser: two `supabase-js` clients on one channel against a **local** Supabase (`supabase start`); A sends `producer:panel-show`, B asserts receipt and payload equality. Two defaults to pin:

| Behaviour | Default | Triton's usage |
|---|---|---|
| `broadcast: { self }` | `false` — messages reach only *other* clients (documented), so a single-client test asserts on silence | Session channels set nothing; `project-sync` sets `self: false` redundantly (`BroadcastContext.tsx:399`) |
| `broadcast: { ack }` | off; `send()` resolves without server confirmation (documented) | Never set. Every `await channel.send(...)` in `useProducerControls` and `trigger/route.ts` proves nothing |

### 4.3 State that survives a reload

`useOverlaySession` restores `visibleAssets` and `activeSegmentId` from `active_state` on mount (`:140–149`). `useProducerOverlay` restores **nothing**: it fetches the session only for `channel_name`, and `ActiveState` (`broadcastTypes.ts:172–179`) has no panel fields. OBS sources get refreshed mid-show routinely; one refresh leaves the outputs inconsistent for good — assets return, panels don't.

One integration case, no UI: seed `active_state`, rebuild state, assert equality with pre-reload. It must fail today for producer panels; write it red. Related asymmetry: `useOverlaySession`'s `cancelled` guard removes a channel created after teardown (`:307–313`); `useProducerOverlay` runs the identical await-then-assign pattern (`:130–160`) unguarded, so a fast unmount leaks a live channel: the fix landed on one hook of two.

---

## 5. Seam 3 — a browser, kept deliberately small

### 5.1 Vitest browser mode, not a second runner

Vitest 4.1.3 is already a dependency and its browser mode's default provider **is** Playwright — one config, runner, reporter, shared aliases (documented). Triton has no large multi-flow suite to justify the standalone runner. `@playwright/test` is absent from `package.json`, so either route adds a dependency — browser mode is the smaller.

| Want | Do |
|---|---|
| Assert a renderer's DOM for 8 preset fixtures | Vitest browser mode, mount the component |
| Producer tab drives overlay tab | Two `BrowserContext`s in one Playwright script (documented) |
| Overlay correct at 1920×1080 | `setViewportSize` + a **clipped** screenshot of the panel region |
| Overlay legible over live video | Not a test — `analytics-ux/` owns it |

### 5.2 What the browser layer must get right

| Concern | The fact in the code | The assertion |
|---|---|---|
| **Transparency** | `app/overlay/overlay.css` forces `background: transparent !important` on `html, body` in a fixed 1920×1080 box, and both overlay pages set it on their root div. Opaque = a black rectangle over live video, catastrophic and invisible to DOM assertions | a small alpha-preserving clip, corner-pixel alpha 0; never the full frame |
| **Animation phase** | named state: `showAsset`/`hideAsset` hold `entering`/`exiting` 2000 ms; producer panels 400 ms enter / 350 ms exit; `performSegmentSwap` sleeps 100 ms between hide and show | Playwright's Clock API steps a controllable clock (documented): three real seconds become three deterministic assertions |
| **OBS itself** | adds GPU compositing, real bitrate, and a human at a desk to a Chromium browser source | not testable, nor needs to be: test the page, review the composite; the pre-show check is operational, not CI |
| **Connection indicator** | both overlays render disconnection as an 8 px red dot at `bottom: 8, right: 8` — inside the 1920×1080 output, so on air, invisible at broadcast distance and a defect if seen | assert its presence; the design question goes to `analytics-ux/` |

---

## 6. Flake management for a system with a real deadline

Google's long-running measurements put roughly 1 in 7 tests at some flakiness, most pass→fail transitions attributable to flakes; the remedies are isolation, determinism, quarantine — not retries (documented).

| Flake source here | Why | Control |
|---|---|---|
| Real network to Supabase Realtime | join latency, quota disconnects | local stack; `expect.poll` with a budget, never a sleep |
| `setTimeout` animation phases | 2000 / 400 / 350 / 100 ms | fake clock; assert phase, not elapsed time |
| `send()` with no ack | no receipt to await | assert on the **receiver**, never the sender |
| Shared channel name | collides with another test or a live show | unique channel per test, torn down in `afterEach` |
| In-memory rate limiter | module-level `Map` persists across tests in a worker | reset module state, or unique `sid` per case |
| Full-frame screenshots | AA, fonts, phase | clip to the region; alpha assertions only |

Policy. **Retries `0` in CI** — a suite that self-heals on attempt two teaches you to ignore it. **Quarantine, don't retry** — a nondeterministic test moves to a non-gating tag with an owner and a date, deleted if the date passes. **Every browser test explains its failure without a rerun** — trace and screenshot on first failure, fixed `timezoneId`/`locale` (documented).

---

## 7. What Triton should do, in order

1. **Fix `fetchArsenal`/`fetchMovement` to read `json.kinematics` and map the route's columns**, then round-trip response keys for all eight presets. Two presets are dead on air — the only outage here.
2. **Make the suite green so it can carry signal.** `leagueStats` expectation → `100` (the code is right); extend the `queryCache` mock through `.maybeSingle()`. Minutes of work; until then every new test lands in noise.
3. **Add `.github/workflows/test.yml` running `npm test` on push and PR, retries `0`** — detail in `10-ci-cd-for-data-apps.md`.
4. **Write the first real route-handler test against `/api/broadcast/trigger`** — §3's seven rows plus `removeChannel`-on-every-exit, each verified against deliberately broken code first.
5. **Derive `BroadcastEventType` from `BROADCAST_EVENTS`, use it at all 28 `.on()` sites, add the listener/sender test.** Fold in `ad:ended` and `clip:marker-update`, delete `video:play`/`video:stop`.
6. **Persist producer panel state into `ActiveState`, restore it in `useProducerOverlay`**, reload-equivalence test written red first; add the missing `cancelled` guard in the same commit.
7. **Then browser coverage** — Vitest browser mode: eight renderers against fixtures, one alpha-channel assertion per overlay route.
8. **Fix `savantValidation`'s env loading** (`dotenv/config` → an explicit `.env.local` setup file) so its 24 skips become coverage or an honest deletion (`03-contract-testing-external-apis.md`).

**Anti-recommendation — do not build this as a Playwright suite driving two real browsers against production Supabase and a live broadcast session.** The intuitive reading of "e2e for a broadcast system" fails three ways. **(i) Wrong defects:** every real bug here — `pitches`/`kinematics`, the missing panel restore, the unused event union, the non-Promise `await` — is data-shaped, catchable in milliseconds in Node, and a browser only reports the blank panel. **(ii) It contends with production:** one Realtime channel per session is the whole architecture, the session id is an unauthenticated capability token, plan caps are shared (500 msg/s, 100 channels per connection) — a test can perturb a real show, and a "safe" duplicate session burns the same quota. **(iii) Economics invert:** browser + network + real timers is the slowest, flakiest layer, the one teams silently stop running — and with no CI today, the first thing built must survive a `git push`. Build it last, under ten tests; **no retries to green**, **no full-frame overlay screenshots**.

**Single highest-leverage next action:** one Vitest test calling all eight producer fetchers against recorded `/api/scene-stats` and `/api/standings` responses, asserting each `PanelContent` is non-empty and renderer-valid. It fails today on arsenal and movement, takes under an hour, and turns a defect visible only to a producer staring at an empty box on live TV into a red line in a terminal.

---

## Sources

1. Next.js — [Route Handlers / `route.js`](https://nextjs.org/docs/app/api-reference/file-conventions/route) — plain `Request`/`Response` functions; §3.
2. Next.js — [Testing with Vitest](https://nextjs.org/docs/app/guides/testing/vitest) — supported wiring; `node` blocks component tests.
3. Vitest — [Configuration reference](https://vitest.dev/config/) — `environment`, `setupFiles`, `retry` (§2, §6).
4. Vitest — [Browser Mode](https://vitest.dev/guide/browser/) — component tests in a real browser.
5. Vitest — [Browser Mode: Playwright provider](https://vitest.dev/guide/browser/playwright) — §5.1's "one runner, Playwright underneath".
6. Vitest — [`vi` API](https://vitest.dev/api/vi.html) — fake timers and module mocking (§5.2, §6).
7. Supabase — [Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast) — `self` false, `ack` opt-in; forces §4.2's harness.
8. Supabase — [`subscribe()` reference](https://supabase.com/docs/reference/javascript/subscribe) — lifecycle; pre-subscribe HTTP fallback (§3).
9. Supabase — [Realtime quotas and limits](https://supabase.com/docs/guides/realtime/quotas) — 3,000 KB, 500 msg/s, 100 channels/connection (§4.2).
10. Supabase — [Realtime architecture](https://supabase.com/docs/guides/realtime/architecture) — what a local harness simulates.
11. Supabase — [Local development](https://supabase.com/docs/guides/local-development) — Realtime tests off production.
12. Phoenix — [Channels](https://hexdocs.pm/phoenix/channels.html) — the model under Realtime; join ≠ `subscribe()` return.
13. Playwright — [Browser contexts / isolation](https://playwright.dev/docs/browser-contexts) — producer and overlay as two clients.
14. Playwright — [`BrowserContext` API](https://playwright.dev/docs/api/class-browsercontext) — per-context `timezoneId`, `locale`, storage (§6).
15. Playwright — [Auto-waiting / actionability](https://playwright.dev/docs/actionability) — why fixed sleeps are wrong for 2000/400/350 ms.
16. Playwright — [Clock API](https://playwright.dev/docs/clock) — stepping animation phases deterministically.
17. Playwright — [Visual comparisons](https://playwright.dev/docs/test-snapshots) — clipping and thresholds; full-frame diffs flake.
18. Playwright — [Trace viewer](https://playwright.dev/docs/trace-viewer) — diagnosing failures without a rerun.
19. Google Testing Blog — [Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) — flake base rates (§6).
20. Google Testing Blog — [Test Flakiness — One of the Main Challenges of Automated Testing](https://testing.googleblog.com/2020/12/test-flakiness-one-of-main-challenges.html) — quarantine-and-fix over retry-to-green.
21. Martin Fowler — [Eradicating Non-Determinism in Tests](https://martinfowler.com/articles/nonDeterminism.html) — the taxonomy behind §6's table.

**Triton-internal evidence.** `npx vitest run`, 2026-08-12: `Test Files 2 failed | 4 passed | 1 skipped (7)`, `Tests 5 failed | 93 passed | 24 skipped (122)`, 222 ms — 4 in `__tests__/lib/queryCache.test.ts` (`TypeError: …gt(...).maybeSingle is not a function`, at `lib/queryCache.ts:22`), 1 at `__tests__/lib/leagueStats.test.ts:40` (`expected 100 to be Infinity`) vs the guard at `lib/leagueStats.ts:1320–1323`. `vitest.config.ts:10–14` (`environment: 'node'`, `setupFiles: ['dotenv/config']`); no `.env` at the repo root (only `.env.local`, `.env.vercel`), so `savantValidation.test.ts`'s `describe.skipIf(!hasEnv)` always skips. `__tests__/api/playerData.test.ts:5–7` redefines `prefixColumns`; no test imports from `app/api/**`. Workflows: `.github/workflows/retro-ingest.yml` only. Broadcast, 2026-08-12: `lib/useProducerControls.ts:199–201`, `:223–224` fetch `?kinematics=true`, read `json.pitches`; `app/api/scene-stats/route.ts:1504–1527` returns `{ kinematics: data }` (per-pitch-type averages, no `usage_pct`); `app/(visualize)/visualize/pitch-lab/page.tsx:80–83` reads `data.kinematics`; `components/producer/renderers/ArsenalRenderer.tsx:13,40,97` need `usage_pct`. `lib/broadcastTypes.ts:172–179` (`ActiveState`, no panel fields), `:194–215` (21-event union), `:217` (`BroadcastEvent`), neither imported in `app/`, `lib/`, `components/`; 28 `.on('broadcast', …)` sites repo-wide, all literals. `lib/useOverlaySession.ts:140–149`, `:307–313`, `:335`; `lib/useProducerOverlay.ts:21–22`, `:130–160`. `app/api/broadcast/trigger/route.ts:6` (19 actions), `:14–31` (validation, `checkRateLimit(sid, 60, 60_000)`), `:35–48` (session-as-token, 404/409), `:62–93` (panel actions, `await channel.subscribe()`, `removeChannel` per exit), `:216,251` (`clip:marker-update`). `components/broadcast/BroadcastContext.tsx:399`, `:1325–1372`, `:445–455`. `@supabase/realtime-js` `RealtimeChannel.d.ts:185` — `subscribe()` returns `RealtimeChannel`. Stack (195 route handlers, 17 crons, 15 route groups, Next 16.1.6 / React 19.2.3 / Vitest 4.1.3, no Playwright or DOM env in `package.json`) from the central 2026-08-12 pass. No production database was queried, no broadcast session started.
