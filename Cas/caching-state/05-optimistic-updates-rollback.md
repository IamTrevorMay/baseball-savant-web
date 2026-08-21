---
title: Optimistic Updates and Rollback — Promising the Write Landed, and Meaning It
domain: caching-state
tags:
  - optimistic-ui
  - rollback
  - conflict-resolution
  - supabase-js
  - rls
  - error-surfacing
  - work-kanban
sources_reviewed: 10
last_updated: 2026-08-21
---

# Optimistic Updates and Rollback — Promising the Write Landed, and Meaning It

> Cas owns **the correctness of the state on screen**. Waiting time belongs to
> `frontend-data-scale/10-perceived-performance.md`; Realtime transport to
> `04-realtime-sync-consistency.md`, so here I own only the user-facing half of a conflict. Grades:
> **(verified)** read at `file:line`; **(documented)** vendor/spec docs; **(inferred)** mechanism;
> **(cargo-cult)** repeated but unsupported.

## TL;DR

- **Optimistic UI promises the write succeeded, and is honest only if the failure path is real** — a rollback never run against a real rejection is not known to work. **(inferred)**
- **`supabase-js` *resolves* with `{ error }` on a rejected write instead of throwing, so a bare `try/catch` catches almost nothing** — only a network-level fetch rejection reaches the handler. **(documented)**
- **Triton has that bug live in two Kanban boards** — `WorkBoard.tsx:523-538` and `myboard/page.tsx:155-166`; a rejected card move stays on the board looking saved until reload. **(verified)**
- **Both files handle the same call shape correctly ~50 lines away** (`WorkBoard.tsx:463-474`, `myboard/page.tsx:91-104`) — destructure, restore a snapshot. Inconsistency, not ignorance. **(verified)**
- **A third mode neither pattern catches: an RLS `USING` denial updates zero rows and returns no error** — Postgres prints `UPDATE 0`; only `.select()` detects it. **(documented)**
- **The pattern is repo-wide: 55 unchecked client mutation sites versus 19 checked**, while the app-wide `ToastProvider` (`app/layout.tsx:51`) has one consumer. **(verified)**
- **Conflict resolution is absent by construction**: `lib/useOverlaySession.ts:176-193` merges `elementUpdates` as a last-writer-wins register with no version field. **(verified)**
- **Zero `useOptimistic`, `useMutation`, `setQueryData`, `throwOnError` repo-wide** on React 19.2.3 and react-query 5 — every optimistic path is hand-rolled, and neither library fixes the miss. **(verified)**
- **"Add a rollback animation so users notice" is cargo-cult** — the signal must be a message the user can act on, not a motion they may not be watching. **(cargo-cult)**

## 1. Three ways a write fails, and what catches each

| # | Failure | How the client sees it | `try/catch` | `{ error }` | `.select()` + rows |
|---|---|---|---|---|---|
| 1 | Network down, DNS, TLS, aborted fetch | Promise **rejects** | ✅ | ❌ (never assigned) | ✅ |
| 2 | CHECK / FK / unique violation; RLS `WITH CHECK` denial | Resolves `{ data: null, error: {…} }` | ❌ | ✅ | ✅ |
| 3 | RLS `USING` denial; filter matched no row | Resolves `{ error: null }`, 0 rows | ❌ | ❌ | ✅ |

PostgREST maps `23503`→409 and `42501`→403/401, and `supabase-js` returns all of it in the response
object rather than throwing **(documented)**. Mode 3 is the one nobody plans for — the Postgres RLS
manual shows `update passwd set real_name='John Doe' where user_name='admin'` → `UPDATE 0`, no
error, because `USING` **silently filters** while `WITH CHECK` raises **(documented)**. `work_tasks`
carries both clauses (`scripts/create-work-tables.sql:177-178`), so one table produces both modes.

## 2. The live bug — three sites in one file

`components/work/WorkBoard.tsx` is drag-and-drop Kanban on `@hello-pangea/dnd` 18. Three mutation
sites, three different failure contracts:

| Site | Shape | 1 | 2 | 3 | Verdict |
|---|---|---|---|---|---|
| `:463-474` `updateTask` | `const { error }` + snapshot restore | ❌ | ✅ | ❌ | Honest for the common case |
| `:477-485` `deleteTask` | `const { error }` + re-insert snapshot | ❌ | ✅ | ❌ | Same |
| `:523-538` `onDragEnd` | `try { await … } catch { fetchTasks() }` | ✅ | ❌ | ❌ | **Optimism with no rollback** |

At `:516-521` the board optimistically moves the card and reindexes siblings; at `:524-528` it
awaits the write; at `:536-537` it catches — a branch that fires only on mode 1. Modes 2 and 3 land
in the same place: `onBoardChange?.()` runs at `:540` and the board reports a success it never
received. `app/(work)/work/myboard/page.tsx` repeats it more sharply: `:147` carries the comment
`// Optimistic update`, `:155-166` is the identical `try/catch`, and `:91-104` does the correct
thing *and* fires `toast('Failed to move task', 'error')` **(verified)**.

**Why this is worse than no optimism.** Without it the card snaps back and the user re-tries. With
broken optimism the user gets a moved card, a clean board, no signal — and finds the move gone
tomorrow. *Design for the honest state* says error is a real state; this code cannot represent it.

**The likeliest trigger is the one least likely to be tested.** The `ready`/`in_progress`/`holding`
statuses the sprint columns write (`:498`) exist only because
`scripts/alter-work-tasks-add-sprint-statuses.sql` widened the `status` CHECK — a hand-run script,
with **no `supabase/migrations/` directory in the repo** **(verified)**. If it missed an environment,
every sprint drag is a `23514` violation swallowed at `:536`, and the code cannot distinguish "the
migration ran" from "it didn't" — dishonest optimism by definition **(inferred)**.

## 3. How widespread — the checkable pattern

Scanning every `'use client'` module for a mutation chain (`insert`/`update`/`upsert`/`delete`) and
looking back five lines for a `const { … error … }` destructure: **19 checked, 55 unchecked**, across
18 files. Only two of the three shapes are bugs:

| Behaviour | Effect on displayed state | Examples |
|---|---|---|
| Optimistic + `try/catch` | State lies until reload | `WorkBoard.tsx:523-538`, `myboard/page.tsx:155-166` |
| Optimistic + nothing | State lies until reload | `compete/video/page.tsx:619-634`, `channels/page.tsx:255-264` |
| Write then refetch | Self-corrects; failure silent, not false | `MobileWorkMyBoard.tsx:33,40,48`, `goals/page.tsx:67,73` |

The third bucket is honest by accident — `reload()` re-reads the server, so its defect is a missing
*message*, not a wrong state. **The grep worth wiring into review:** a mutation verb on a `supabase`
chain with no `error` identifier in the preceding five lines, inside a `'use client'` file.

## 4. What a rejected write should look like on screen

Triton owns the mechanism and does not use it: `components/ui/Toast.tsx` is mounted app-wide
(`app/layout.tsx:51`) and imported by one file, `myboard/page.tsx:7` **(verified)**.

| Failure mode | Correct surface |
|---|---|
| Mode 1 (offline) | Revert; "Couldn't reach the server — move not saved" |
| Mode 2 / 3 (rejected, or matched nothing) | Revert; state the *reason* in user terms, then refetch |

NN/g's bar — visible, plain, actionable — is met by none of this **(documented)**. Reverting
*without* a message is a second dishonesty: the user sees the card jump back and assumes they missed
the drop.

## 5. Conflict resolution — last-writer-wins with no version

`lib/useOverlaySession.ts:176-193` handles `asset:update` by merging the payload into local element
props: `{ ...el, props: { ...el.props, ...elementUpdates[el.id] } }` — no version, no timestamp, no
author id, no comparison against local state **(verified)**. That is a per-property last-writer-wins
register, whose documented failure mode is that concurrent edits are lost without trace
**(documented)**. Two producers nudging one lower-third interleave silently, and since broadcast has
no replay, clients can settle on different winners. The half I own:

| The second editor should see | Why |
|---|---|
| Presence: someone else has this asset open | Prevents the conflict rather than resolving it |
| Remote changes arriving visibly and attributed | A property that moves by itself reads as a bug |

Figma affords concurrent editing only because its LWW carries server ordering **and live cursors**,
so a losing edit stays visible as someone else's action **(documented)**. Triton has neither.

## 6. What `useOptimistic` and react-query would and would not fix

Repo-wide on React 19.2.3 and `@tanstack/react-query` ^5.100.10: **0** `useOptimistic`, **0**
`useMutation`, **0** `onMutate`, **0** `setQueryData`, and exactly **1** `invalidateQueries`
(`lib/hooks/useABSData.ts:196`) **(verified)**.

| Adopt | Fixes | Does **not** fix |
|---|---|---|
| `useOptimistic` | The revert: optimistic and real state converge in one render when the transition ends **(documented)** | Deciding *whether* the write failed — it reverts either way |
| react-query `onMutate`/`onError`/`onSettled` | Snapshot, restore, refetch — the documented rollback shape **(documented)** | The same: `onError` fires only if the mutation **throws** |

Both are worth adopting; neither is the fix. The load-bearing line in either turns a resolved
`{ error }` into a rejection — `.throwOnError()`, used **zero** times in Triton **(verified)**.
**The library without the throw converts a silent lie into a silent revert: one grade better, not a
fix (inferred).**

## 7. Proving the rollback works

*A test that has never failed proves nothing.* Every rollback branch in §2's honest column has never
run against a real rejection — `__tests__/` holds 7 files, none touching `components/work/`
**(verified)**. This repo already shipped `/api/admin/backfill-stuff-plus` broken because nothing
exercised it. Three Vitest cases against one mocked module, no database needed:

| Case | Mock returns | Assert |
|---|---|---|
| Mode 1 | `mockRejectedValue(new TypeError('fetch failed'))` | Card returns to source column; error toast fired |
| Mode 2 | `{ data: null, error: { code: '23514' } }` | Same — this is the case that currently fails |
| Mode 3 | `{ data: [], error: null }` from `.select()` | Same, plus a refetch |

Write case 2 first and watch it **fail** against `WorkBoard.tsx:523-538` before touching the code;
`vi.mock` with a factory over the client module is the standard shape **(documented)**.

## 8. When optimism is dishonest

| Condition | Optimistic? | Why |
|---|---|---|
| Local, reversible, single-owner (task position, message edit) | Yes | Rejection is rare; revert is cheap and legible |
| Rejectable by a rule the client doesn't model (RLS, CHECK) | Only with a real failure path | You would promise what you cannot predict |
| Multi-writer surface with no ordering (broadcast assets) | No | You cannot show a merge you don't perform |

## What Triton should do, in order

1. **Fix `WorkBoard.tsx:523-538` and `myboard/page.tsx:155-166`.** Replace `try/catch` with
   `const { error } = await …`; on error restore the pre-drag snapshot (`currentTasks`, captured at
   `:494`) and fire an error toast. Copy the shape from `:463-474` in the same file.
2. **Make the drag write prove itself**: chain `.select('id').single()` so a zero-row update becomes
   a `PGRST116` error instead of silence — `WorkBoard.tsx:445-451` already does this for inserts.
3. **Write the three §7 cases, mode 2 first, and confirm it fails before the fix.**
4. **Adopt `useToast` at the other 17 mutating client files** — the provider is already mounted.
5. **Add the §3 grep to review**, so one bug stays a checkable pattern; only *then* consider
   `useOptimistic` or react-query mutations with `.throwOnError()`.

**Anti-recommendation: do not "fix" this by dropping optimism and awaiting every write before
re-rendering.** Three independent grounds. (1) It does not fix the bug: a pessimistic write whose
result is still unchecked leaves the card in its *old* column while the server has it in the new one
— the same lie pointing the other way. (2) It breaks drag-and-drop: `@hello-pangea/dnd` hands you
the drop and expects the list to reflect it, so deferring the reorder snaps the card back on every
*successful* move, training the user to distrust the board. (3) It costs what optimism buys and
returns nothing: the honest version is six lines and already exists twice in the same file.

**Highest-leverage next action:** write the mode-2 Vitest case (`{ data: null, error: { code:
'23514' } }`) against `WorkBoard.onDragEnd`, watch it fail, then apply fix #1. That one failing test
converts "we think rollback works" into evidence, and it gates every other item here.

## Sources

- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — the `UPDATE 0` example behind mode 3.
- [PostgREST — Errors](https://postgrest.org/en/stable/references/errors.html) — the code→status mapping returned as `{ error }`.
- [supabase-js — `update()`](https://supabase.com/docs/reference/javascript/update) — "updated rows are not returned… chain `.select()`": why only `.select()` proves a write landed.
- [postgrest-js — `PostgrestBuilder`](https://github.com/supabase/postgrest-js/blob/master/src/PostgrestBuilder.ts) — the `then()` that resolves errors into the response unless `throwOnError` is set.
- [React — `useOptimistic`](https://react.dev/reference/react/useOptimistic) — what its revert does and does not decide (§6).
- [TanStack Query — Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) — the `onMutate`/`onError`/`onSettled` rollback shape, unused here.
- [Shapiro et al. — Convergent and Commutative Replicated Data Types](https://inria.hal.science/inria-00555588) — the LWW-register semantics `useOverlaySession.ts:176-193` implements by accident.
- [How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — LWW made honest by ordering and cursors (§5).
- [NN/g — Error Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) — the bar a silent revert fails.
- [Vitest — Mocking](https://vitest.dev/guide/mocking) — the `vi.mock` factory form used in §7.

**Triton-internal evidence.** All `file:line` read 2026-08-21 at commit `d6147f0`; no database was
queried. The bug: `components/work/WorkBoard.tsx:516-521` (optimistic reorder), `:523-538`
(`try { await supabase.from('work_tasks').update(...) } catch { fetchTasks() }`), `:540`
(`onBoardChange?.()` fires regardless); duplicated at `app/(work)/work/myboard/page.tsx:147,155-166`.
Correct siblings: `WorkBoard.tsx:463-474`, `:477-485`, `:445-451` (`.select().single()` +
`if (!error && data)`); `myboard/page.tsx:91-104`, `:110-119`, each with `toast(..., 'error')`.
Schema: `scripts/create-work-tables.sql:156`, `:159-160`, `:177-178` (`USING` + `WITH CHECK`),
widened by `scripts/alter-work-tasks-add-sprint-statuses.sql:7-9`; `supabase/` holds **0** migration
files. Repo-wide scan of `'use client'` modules: **19** checked vs **55** unchecked mutation sites
across 18 files, unchecked-and-optimistic including `app/(compete)/compete/video/page.tsx:619-634`
and `app/(work)/work/channels/page.tsx:255-264`. Error channel: `components/ui/Toast.tsx`, mounted
`app/layout.tsx:51`, imported only by `app/(work)/work/myboard/page.tsx:7`. Conflict path:
`lib/useOverlaySession.ts:167-195`. Counts across `components/`, `app/`, `lib/`: `useOptimistic`,
`useMutation`, `onMutate`, `setQueryData`, `cancelQueries`, `throwOnError` all **0**;
`invalidateQueries` **1** (`lib/hooks/useABSData.ts:196`). `__tests__/` holds 7 files, none touching
`components/work/`.
