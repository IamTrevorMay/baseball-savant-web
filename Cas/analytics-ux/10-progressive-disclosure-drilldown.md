---
title: Progressive Disclosure & Drill-Down — Getting to the Detail Without Losing the Question
domain: analytics-ux
tags:
  - progressive-disclosure
  - drill-down
  - tooltips
  - modals
  - url-state
  - navigation-context
  - provenance
sources_reviewed: 13
last_updated: 2026-08-13
---

# Progressive Disclosure & Drill-Down — Getting to the Detail Without Losing the Question

> Grades: **(verified)** Cas read it at `file:line`; **(documented)** vendor/standards docs;
> **(inferred)** mechanism; **(cargo-cult)** repeated, unsupported. No production query was run.

## TL;DR

- **Triton's only disclosure mechanism is a 17-line CSS hover tooltip on column headers in 12 files.** Everything else is always-visible or a full page. **(verified)**
- **When a metric has no definition, `Tip` renders the bare label with no affordance**, so "undocumented" is indistinguishable from "not hoverable." **(verified)**
- **Two competing definition stores decide what a tooltip says, and the registry loses.** `getTip()` checks a 101-key hardcoded label map *before* `METRIC_REGISTRY`, shadowing its 68 `tip:` fields. **(verified)**
- **A tooltip showing the wrong definition is worse than none** — it converts uncertainty into false confidence, making a definition conflict a P1 display bug. **(inferred)**
- **The drill-down Triton most needs does not exist: "why is this cell a dash?"** `stuff_plus_n` is computed in the materialized views and read by nothing. **(verified)**
- **Filter context is not in the URL on any player page.** `usePlayerData` (302 lines) has no `useSearchParams`, no `router`, no history write; 7 of 96 pages read search params. **(verified)**
- **`filter_templates` — the documented way to save and share a 50-field filter config — has zero application code**, and a SQL script annotates it "deny all (unused)." **(verified)**
- **Producer and overlay surfaces should carry no disclosure at all**: one number, under a second, and hover does not exist on an OBS source. **(inferred)**

---

## 1. Four layers, sorted by what they cost the question

Shneiderman's mantra — overview first, zoom and filter, details on demand — sorts by what the user is doing. Cas adds a column: what happens to the question they were holding.

| Layer | Costs | Question survives? | Right for |
|---|---|---|---|
| **In-place** (badge, footnote, cell colour) | Nothing | Yes | n, coverage %, staleness — anything changing how to *read* the number |
| **Overlay** (tooltip, popover) | A hover or click | Yes | Definitions, formulas, comparison population |
| **Adjacent panel** (drawer, expanded row) | Layout shift | Yes | Per-pitch rows behind an aggregate |
| **New context** (modal, route) | Attention or navigation | **Only if rebuilt** | A different entity: another player or season |

The rule that falls out: **anything that changes how a number should be read must never live above the in-place layer.** A sample size hidden in a tooltip will not be seen by the person about to say that number on air. Definitions can hide; caveats cannot. **(inferred)**

Overview layout hierarchy is `05-dashboard-information-architecture.md`; in-table row affordances are `07-dense-table-design.md`.

## 2. Picking the container

| Container | Keyboard | Holds links | Blocks page | Use in Triton for |
|---|---|---|---|---|
| CSS `:hover` span (today) | No | No (`pointer-events-none`) | No | Nothing that matters |
| APG disclosure (`aria-expanded`) | Yes | Yes | No | Expanding a table row into its pitches |
| Popover API / `[popover]` | Yes | Yes | No | Definition + "n = 214" + glossary link |
| `<dialog>` (modal) | Yes | Yes | **Yes** | Almost nothing on an analytics surface |
| Route (`/player/[id]`) | Yes | — | Replaces | A different entity |

Hover content must be **hoverable, dismissible, persistent** (WCAG 1.4.13); a `group-hover` span with `pointer-events-none` fails all three, since moving toward it destroys it. APG additionally requires a focusable trigger — a `<span>` with `cursor-help` is not one. **Modals are the wrong default here** too: they hide the table the user opened them to interrogate. Reserve them for destructive confirmation and required decisions. **(documented)**

## 3. Triton's disclosure layer, as built

`components/Tip.tsx` is 17 lines: it resolves text through `getTip()` and renders a hover span, or — the load-bearing line, `Tip.tsx:7` — nothing at all: `if (!tip) return <>{label}</>`. Three consequences, all verified:

1. **Missing definitions are invisible.** `cursor-help` appears only when a tip resolves, and only on hover. A user cannot discover a column is undocumented — only fail to discover it is documented. With 67 of 69 registry keys absent from `docs/VARIABLES.md`, undocumented is the common case.
2. **Resolution order decides truth by accident.** `getTip()` (`lib/glossary.ts:129`) tries the DB glossary (keyed by `column_name`), then `METRIC_TIPS` (**101** entries keyed by *display label*), then `METRIC_REGISTRY[key].tip`, then a label scan. `<Tip label={c.l} />` passes a label, so the hardcoded map beats the registry nearly every time and its **68** `tip:` fields are mostly dead. Deception and Unique live in both stores; which one a user sees is settled by string-namespace collision, not judgment.
3. **The tooltip cannot grow.** `pointer-events-none` and `max-w-[220px]` rule out a link, a copyable number, or a nested "see the sample" — so the definition container cannot be reused for provenance.

The fix is not more tooltip content but admitting there are two jobs: keep the hover span for the short definition, add a **popover** for provenance, collapse the two stores so one edit changes every surface.

## 4. The drill-down that should exist: "why is this cell a dash?"

`OverviewTab` renders `—` for absent values throughout. A dash says *that* a value is missing, never *why* — and the reasons differ wildly:

| The user sees | Actually means | Right disclosure |
|---|---|---|
| `—` on 2016 Deception | Metric starts 2017 | In-place era band on the axis, not a tooltip |
| `—` on 2026 Stuff+ | Upstream coverage collapsed | Loud, in-place, at the tile level |
| `—` on Lahman-only Whiff% | Pre-Statcast season | Row-level source badge |
| Grey / low-confidence value | n below stabilization | In-place n + popover for composition |

**The last row's data half-exists and is unwired.** `stuff_plus_n` is `COUNT(p.stuff_plus)` at `scripts/create-materialized-views.sql:105` and `:323`; nothing in `app/`, `lib/`, or `components/` reads it. Li's proposed `MetricDef.stabilizesAt` and `coverage.nullMeans` name Cas as consumer — and that consumer is the popover asked for here. **(verified)** Null/zero encoding is `02-null-zero-unknown-ui.md`; loading and stale states are `08-loading-empty-error-states.md`. This doc owns only what a click on the cell opens.

Why this is urgent, not cosmetic: `OverviewTab.tsx:29-31` builds Lahman-only rows with `pitches: 0, '2b': 0, '3b': 0` — literal zeros for unknowns, sharing columns with real Statcast counts, which then average, total, and colour as if measured. Disclosure cannot fix that; it can only make it visible.

## 5. Keeping the question on navigation

The navigation surface is **15 route groups** and **96** `page.tsx` files, `(research)` alone at **28**, plus a fully parallel MiLB tree at `app/(milb)/milb/player/[id]`. Any drill-down crossing trees is a context reset. Three loss mechanisms, in order of cost: **(verified)**

1. **No filter state in the URL.** `lib/hooks/usePlayerData.ts` holds `activeFilters`, `tab`, `selectedYear`, `seasonType` in React state — no `useSearchParams`, no `router` call, no `history.replaceState`. A 6-chip filter cannot be shared, bookmarked, or survive a refresh. Only **7 of 96** pages read search params, and no player page is among them.
2. **`filter_templates` is a dead end.** The documented escape hatch — persisted, shareable filter configs — has **zero** references in `app/`, `lib/`, `components/`; it exists only in `CLAUDE.md`, `docs/VARIABLES.md`, and two SQL scripts, one annotating it "deny all (unused)."
3. **Full-page navigations.** `window.location.href = …` appears **11** times, including the MiLB explore→player jump at `explore/page.tsx:308,311` — a document reload discarding React state, scroll, and in-flight fetches. The other **49** use `router.push` and keep the app shell.

The remedy is cheap: **serialize filter state into the query string** with `history.replaceState`, read it back with `useSearchParams`. One change buys shareability, bookmarks, refresh-survival, and a working back button — and makes `filter_templates` a saved URL rather than new schema. **(documented)**

Preserve one thing deliberately: `PitchLogTab.tsx:116` opens pitch video via `window.open(…, '_blank')`. Designed or not, it is right — the heaviest detail view costs nothing, because the filtered page survives in the tab behind it.

Boundary: drilling from a single-player view (client filtering, instant) into a cross-player comparison (server aggregation, a round trip) changes cost class; whether that trip is acceptable is `Cas/frontend-data-scale/03-client-vs-server-computation.md`.

## 6. Where disclosure is the wrong answer

Broadcast is the inverse surface: one number on a 1920×1080 transparent overlay, read at distance over live video in under a second, by a viewer with no pointer. **Hover does not exist on an OBS browser source**, so every caveat must be resolved *before* the push — making the producer panel, not the overlay, where n and coverage belong in-place. Typography there is `11-broadcast-overlay-legibility.md`. **(inferred)** Mobile is the second inverse: `useDevice()` routes to `MobilePlayerDashboard`, and hover degrades to nothing on touch. **(verified)**

## 7. What Triton should do, in order

1. **Collapse the two definition stores.** Make `METRIC_REGISTRY[].tip` the single source, demote `METRIC_TIPS` to a fallback checked *last*, resolve Deception/Unique explicitly.
2. **Give `Tip` a visible "undocumented" state.** When `getTip()` returns empty, render a muted marker instead of a bare label — turning an invisible gap into a work queue and surfacing all 67 keys at once.
3. **Put filter state in the URL.** Serialize `activeFilters`, `tab`, `selectedYear`, `seasonType` via `history.replaceState`; hydrate from `useSearchParams`.
4. **Wire `stuff_plus_n` into a provenance popover.** Click a header or dashed cell → "n = 214 of 231 · 92.6% coverage · as of *date*." Popover API, not the hover span.
5. **Replace the two `window.location.href` MiLB jumps with `router.push`**, carrying the filter query string across the tree boundary.
6. **Keep tabs mounted instead of the `&&`-rendering at `page.tsx:132-142`** only if profiling shows re-entry cost.

**Anti-recommendation: do not build a "metric detail modal."** The obvious move, wrong on three independent grounds. *(a)* It blocks the comparison — the modal covers the table the user opened it to interrogate, exactly the failure the modal/nonmodal guidance describes. *(b)* It puts the caveat in the most expensive attention layer, so it is dismissed unread precisely when the sample is thin; caveats belong in-place. *(c)* It builds a container while the content problem is unfixed — with two conflicting definition stores, a modal renders the same wrong text as the tooltip, with more ceremony.

**Highest-leverage next action:** make `getTip()` prefer `METRIC_REGISTRY[].tip` over `METRIC_TIPS`, and render a muted marker when nothing resolves — two lines in `lib/glossary.ts`, one in `components/Tip.tsx`. That turns a silent, arbitrarily-resolved definition layer into a visible, single-sourced one: the precondition for everything else here.

## Sources

1. Shneiderman — [The Eyes Have It (1996)](https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf) — the layering §1 re-sorts by context cost.
2. NN/g — [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — staging by frequency of need; why the common case stays in-place.
3. NN/g — [Tooltip Guidelines](https://www.nngroup.com/articles/tooltip-guidelines/) — supplementary text only, never what's required to act; §1's "caveats cannot hide."
4. NN/g — [Modal & Nonmodal Dialogs](https://www.nngroup.com/articles/modal-nonmodal-dialog/) — the blocking cost behind §2 and §7's anti-recommendation.
5. NN/g — [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — visibility of status; the case for a visible undocumented marker.
6. W3C APG — [Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) — the `aria-expanded` contract for expandable rows.
7. W3C APG — [Tooltip Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) — focusable trigger, show-on-focus; `Tip.tsx` meets neither.
8. W3C — [WCAG 1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html) — hoverable/dismissible/persistent; §3's failures.
9. W3C APG — [Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — focus-trapping obligations that make modals expensive to do right.
10. MDN — [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) — light-dismiss, top-layer, keyboard-reachable; §4's provenance container.
11. MDN — [`<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) — modal semantics for free, for the two cases §2 allows.
12. MDN — [History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API) — `replaceState` for filter state without navigating; §5's remedy.
13. Next.js — [`useSearchParams`](https://nextjs.org/docs/app/api-reference/functions/use-search-params) — reading that URL state back.

**Triton-internal evidence (repo read 2026-08-13; no production query).** `components/Tip.tsx` is **17** lines; returns a bare label at `:7` when no tip resolves; span carries `pointer-events-none`, `hidden group-hover/tip:block`, `max-w-[220px]`, `cursor-help` (`:10-13`). `<Tip …>` in **12** files (`GameLogTab.tsx` ×6, `OverviewTab.tsx:187`, 7 others ×1). Resolution order, `lib/glossary.ts:129`: DB glossary → `METRIC_TIPS` (**101** keys, `:32-125`, keyed by display label) → `METRIC_REGISTRY[key].tip` → `getRegistryTipByLabel` (`lib/metricRegistry.ts:699-702`; **64** entries, **68** `tip:` occurrences in 702 lines). `OverviewTab.tsx:187` passes `label={c.l}`, so the label map precedes the registry; Deception at `metricRegistry.ts:453-455`. `stuff_plus_n` = `COUNT(p.stuff_plus)::int`, `scripts/create-materialized-views.sql:105`,`:323`; **0** refs in `app/`,`lib/`,`components/`. Null-as-zero: `OverviewTab.tsx:29-31` (`pitches: 0, '2b': 0, '3b': 0` on Lahman-only rows). Navigation: **15** route groups, **96** `page.tsx` (**28** in `(research)`), parallel `app/(milb)/milb/player/[id]/page.tsx`. `lib/hooks/usePlayerData.ts` = **302** lines, no match for `useSearchParams|router\.|window.history|localStorage`; **7 of 96** pages import `useSearchParams`, none a player page. `filter_templates`: **0** app hits; only `CLAUDE.md:150`, `docs/VARIABLES.md:445`, `scripts/enable-rls.sql:549-552`, `scripts/fix-security-advisories.sql:125` ("deny all (unused)"). **11** `window.location.href` vs **49** `router.push`, incl. `app/(milb)/milb/explore/page.tsx:308,311`. Video: `PitchLogTab.tsx:116` `window.open(…, '_blank')`. Tab unmount: `&&` renders at `app/(research)/player/[id]/page.tsx:132-142`; `FilterEngine` at `:108`. Carried from the 2026-08-12 packet, not re-measured: the 67-of-69 undocumented-key count, the Deception/Unique conflict, and Li's proposed `MetricDef.stabilizesAt` / `coverage.nullMeans`.
