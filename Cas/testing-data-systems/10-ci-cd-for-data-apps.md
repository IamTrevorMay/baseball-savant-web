---
title: CI/CD for Data Apps — Gating a Deploy When Half the System Isn't in the Repo
domain: testing-data-systems
tags:
  - ci-cd
  - github-actions
  - vercel
  - supabase
  - migrations
  - preview-environments
  - deploy-gating
  - schema-drift
sources_reviewed: 23
last_updated: 2026-08-13
---

# CI/CD for Data Apps — Gating a Deploy When Half the System Isn't in the Repo

> Grades: **(verified)** Cas ran it or read it at the cited line; **(documented)** vendor docs;
> **(inferred)** mechanism reasoning; **(cargo-cult)** copied, never justified. Cron/ingest *runtime*
> reliability is `Jo/data-reliability/11-serverless-cron-reliability.md`; this doc owns only the
> pipeline that gates a **deploy**.

## TL;DR

- **Triton has no pre-merge CI at all.** `.github/workflows/` holds one file, `retro-ingest.yml`, on `schedule` + `workflow_dispatch`; nothing in the repo has a `pull_request` trigger or invokes `vitest`, `tsc`, or `eslint`. **(verified)**
- **The whole non-production suite runs in 199 ms** — `npx vitest run __tests__/lib __tests__/api`, 98 tests, 93 pass / 5 fail, 0.55 s wall. Gating every PR costs `npm ci`, not tests. **(verified)**
- **Adding the suite to CI without excluding `__tests__/integration/` buys a green light meaning nothing.** `savantValidation.test.ts:38` is `describe.skipIf(!hasEnv)`, and `vitest.config.ts:11` loads `dotenv/config`, which reads a `.env` that does not exist here — it skips silently, in CI and locally. **(verified)**
- **There is no migration layer to test.** No `supabase/migrations/` exists (only `.temp/`), 32 `scripts/*.sql` are pasted into the SQL editor by hand, and nothing records which have been applied. **(verified)**
- **Vercel rolls code back in seconds; a migration does not roll back at all** — so a deploy where code and DDL must move together is the one shape to avoid. **(documented / inferred)**
- **A preview deployment here almost certainly writes to production Postgres** — one project ref, one `NEXT_PUBLIC_SUPABASE_URL`, no branch config in the repo. **(inferred)**
- **The data checks worth gating on already exist as library code:** `lib/dataIntegrity.ts` exports 8 checks in 433 lines and runs nightly, with nothing connecting them to a deploy. **(verified)**
- **Two cron handlers ship with no schedule.** `app/api/cron/` has 17 directories; `vercel.json` registers 15 — `challenges` and `newsletter` are unreachable code one grep would catch forever. **(verified)**

---

## 1. The starting point, measured

| Signal | Exists? | Where it runs today | Gated on? |
|---|---|---|---|
| Unit tests (Vitest) | yes, 98 tests | a laptop, when someone remembers | nothing |
| Typecheck | implicitly | `next build` on Vercel, post-merge | the deploy |
| Lint | script only (`"lint": "eslint"`) | nowhere | nothing |
| Build | yes | Vercel, on push | the deploy |
| Schema migration | **no framework** | SQL editor, by hand | nothing |
| Data-integrity checks | yes, 8 of them | nightly cron, 10:00 UTC | nothing |
| Doc/route/cron consistency | no | — | nothing |

The one workflow present, `retro-ingest.yml`, is a *scheduled data job* wearing CI clothing: build
Chadwick, `npm ci`, ingest, validate, summarise. Well built; gates nothing. At ~10 merges a week
(85 commits in the 60 days to 2026-08-12), one production deploy each, the change-failure detector
is Trevor looking at a screen. **(verified / inferred)**

---

## 2. The stage shape that fits this repo

Four stages, separated by *what they may touch* — for a data app that is the axis that matters,
not "unit vs integration".

| Stage | Trigger | Touches | Budget | Blocking |
|---|---|---|---|---|
| **A. Static + unit** | `pull_request`, `push: main` | repo only | < 90 s | **yes** — required check |
| **B. Build** | Vercel on push | repo only | ~2–4 min | yes (already) |
| **C. Post-deploy smoke** | after production promote | prod, read-only, ≤ 10 queries | < 60 s | no — alert |
| **D. Scheduled drift** | nightly/weekly cron | prod, day-chunked, serial | minutes | no — report |

The A/C line is load-bearing. **A PR must never read production.** ~20 concurrent readers took
Supabase down for an hour on 2026-08-12, and a `pull_request` trigger reproduces that pattern on a
schedule nobody controls. Secrets are withheld from fork PRs anyway, so such a job is either
unrunnable or a foot-gun. **(verified / documented)**

Stage A, concretely:

```yaml
# .github/workflows/ci.yml
on: { pull_request: {}, push: { branches: [main] } }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint .
      - run: npx vitest run --exclude '__tests__/integration/**'
      - run: ./scripts/ci-consistency.sh   # §7
```

`tsc --noEmit` is not redundant with `next build`; it moves the same failure from post-merge to
pre-merge for seconds. ESLint needs an explicit call — Next 16 removed `next lint`, hence the bare
`"lint": "eslint"`. **(documented)** Make it a **required status check** on `main` or it is
decorative: an advisory check on a one-committer repo is a notification, and notifications are how
five red tests survived.

---

## 3. The migration layer that doesn't exist

DDL lives in 32 hand-applied `scripts/*.sql` whose headers say so: "Run against Supabase SQL editor"
(`create-email-tables.sql:2`), "Run via: psql or Supabase SQL Editor" (`enable-rls.sql:9`), "paste
entire file and execute" with two blocks left commented for separate execution
(`fix-security-advisories.sql:7,18,371`). No `schema_migrations` table exists in `scripts/`, `lib/`,
or `app/`. **(verified)** Production's schema is therefore unrecoverable from the repo: which of the
32 ran, in what order, and whether a file changed after applying are all unknowable.

| Option | Fit | Cost | Verdict |
|---|---|---|---|
| Status quo | — | zero until it isn't | **the actual risk in this doc** |
| Supabase CLI `migrations/` + `db pull` baseline | native; CLI already linked | half a day | **adopt** |
| Atlas / golang-migrate | strong versioned diffing | new toolchain, new failure modes | overkill at one committer |

The path that avoids archaeology:

1. `supabase db pull` once for a **baseline** of the schema as it is. Do not reconstruct history.
   **(documented)**
2. Every *new* DDL change becomes a timestamped file in `supabase/migrations/`; the 32 legacy
   scripts stay put, marked applied-or-not in a header comment.
3. CI (stage A) asserts only cheap local properties: ordered unique filenames, each file parses,
   each carrying `IF NOT EXISTS`/`IF EXISTS` guards or an explicit `-- non-idempotent: <reason>`.
4. **A human applies them.** See §8's anti-recommendation.

Idempotency is already the repo's instinct (`migrate-newsletter-encryption.sql:2`,
`fix-biomech-reports-private.sql:17`) and is what makes a manual apply safe to retry. Keep it
mandatory. **(verified)**

---

## 4. Ordering: code and schema deploy on different rails

Vercel promotes a build atomically and restores a previous one instantly. Postgres cannot. Every
schema change therefore has a *direction* relative to the deploy, and reversing it is an outage.

| Change | Safe order | Why | Rollback |
|---|---|---|---|
| Add nullable column / new table | **DDL first** | old code ignores it | drop later, or never |
| Add column code will write | DDL → deploy → backfill | writer must exist before rows depend on it | code rollback safe |
| Rename / drop column | expand → deploy → contract, weeks apart | old build may still serve | contract is one-way |
| Tighten access (RLS, bucket privacy) | **deploy first, then DDL** | new serving path must exist before old URLs die | re-open the bucket |
| Change a metric formula | deploy, then re-score | history restates; needs a vintage marker | none — see Li |

Row 4 is not hypothetical. `fix-biomech-reports-private.sql:13-16`: "run this AFTER deploying the
code change, not before. Once the bucket is private, existing public URLs stop resolving; the new
`/api/compete/reports/[id]/pdf` route is what keeps old reports readable." Expand/contract, stated by
hand for one file — exactly the knowledge a merge-triggered runner would destroy. **(verified)**
Encode it as a required `-- order: after-deploy|before-deploy` header and have §3's linter fail any
migration missing one; a convention in one file's comment protects one file.

Two Vercel wrinkles. **Skew protection** keeps a client that loaded the old build talking to that
build's functions, so "old code may still run" is a measurable interval, not a race you can wave off.
And **crons fire only on production deployments** — the largest reason previews are currently
harmless. **(documented)**

---

## 5. Preview environments, and what data they should see

A preview here is production with a different hostname: one project ref
(`supabase/.temp/project-ref`, matching `CLAUDE.md`), a single `NEXT_PUBLIC_SUPABASE_URL`, no
branch-scoped config — and on Vercel a variable set for all environments carries the production value
into Preview. **(inferred / documented)**

| Preview data source | Realism | Blast radius | Effort | When |
|---|---|---|---|---|
| **Production (today)** | perfect | writes hit prod; `service_role` in a PR-built runtime | none | never, once alternatives exist |
| **Supabase branch (ephemeral)** | schema-perfect, data empty→seeded | isolated | needs `supabase/migrations` first | after §3 |
| **Local stack (`supabase start`)** | schema-perfect | zero | slow at 8.88M rows | fixture-scale tests |
| **Committed fixture slice** | partial | zero | already scoped | stage A, now |

Two caveats. **A preview's query plans will not resemble production's:** plans depend on statistics,
and `last_analyze`/`last_autoanalyze` were NULL on all nine tables inspected on 2026-08-12 —
production itself plans on stats of unknown vintage. A seeded 10k-row preview seq-scans what
production index-scans, and the reverse. Previews validate **correctness and UI**, never performance.
**(verified / documented)** And **a preview is worth what its seed is worth** —
`08-test-data-management.md`'s subject; the CI-relevant rules are that it is committed and versioned
with the schema, contains the null-shaped rows (deception pre-2017, MiLB pre-2023) that make empty
and zero states render, and loads in a minute or nobody uses it.

Until branching exists, the useful preview gate is not data but **deployment protection**, so preview
URLs carrying athlete data are not publicly linkable. Biomech PDFs name minors. **(documented)**

---

## 6. Gating a deploy on data checks

"Fail the build if the data is bad" is right about the check and wrong about the stage. A data check
answers a question about *production at this instant*; a PR gate answers one about *this diff*.
Wire the first into the second and the pipeline goes red for reasons no author can fix — and a
pipeline red for unfixable reasons gets ignored.

| Check | Question it answers | Stage | Blocking |
|---|---|---|---|
| `checkSeasonConstants`, registry invariants | is this diff self-consistent? | A | yes |
| Migration lint (§3) | is this DDL well-formed and ordered? | A | yes |
| Golden-file metric diff on the fixture slice | did this diff change a number? | A | yes |
| `checkLeagueAverages`, `checkMaterializedViews` | is prod fresh right now? | **C** | alert only |
| `checkUnknownPlayers`, `checkOrphaned*` | did prod drift overnight? | **D** | report |
| Paired `share(Δ ≠ 0)` on a metric | did anything silently re-score? | D | report |

`lib/dataIntegrity.ts` already implements the C/D column: 8 checks over 433 lines, run nightly by
`app/api/cron/integrity/route.ts` under `Promise.allSettled`, written to `integrity_checks` as
`pass|warn|fail|remediated`. **(verified)** The missing piece is a post-promote invocation — the same
functions, once, against the last row per `check_name` — answering "did my deploy break the data" in
under a minute with no PR touching production.

Freshness SLOs, dead-man switches, and what to do when `refresh` stops belong to
`Jo/data-reliability/11-serverless-cron-reliability.md`. Cas's boundary: a *deploy* may be gated only
on checks it could plausibly have broken. The 46-day-stale `league_averages` outage was not caused by
a deploy; as a gate it would have blocked every unrelated PR for 46 days.

---

## 7. Cheap repo-consistency gates, each mapped to a real drift

Greps: milliseconds in stage A, no database, each mapped to drift that actually happened.

| Gate | Implementation | Drift it maps to |
|---|---|---|
| Every `app/api/cron/*` has a `vercel.json` entry | diff two `ls`/`jq` outputs | `challenges`, `newsletter` ship unscheduled **(verified)** |
| Metric change ⇒ `docs/VARIABLES.md` change | `git diff --name-only` vs base | the repo's own convention, unenforced |
| `CLAUDE.md` route/group counts match reality | `find … route.ts \| wc -l` vs the doc | 6 of 195 routes documented **(verified)** |
| `scripts/*.sql` idempotency header present | grep for guard or opt-out | manual re-runs of unguarded DDL |

The `CLAUDE.md` counter is the least intuitive and the highest-value: doc drift is usually hygiene,
but here the docs are the **primary interface for every AI-assisted change**, so a wrong path becomes
a wrong edit at machine speed. **(inferred)** Ship each as a warning first — a gate that lands red on
day one gets `--no-verify`'d and never trusted again.

---

## 8. What Triton should do, in order

1. **Turn the suite green, then add `.github/workflows/ci.yml`** (§2) on `pull_request` and
   `push: main` — `tsc --noEmit`, `eslint`, `vitest run --exclude '__tests__/integration/**'` — as a
   required check. 90 seconds; blocks nothing legitimate.
2. **Add §7's four greps** as `scripts/ci-consistency.sh`: cron↔`vercel.json`, `VARIABLES.md` drift,
   `CLAUDE.md` route/group counts, SQL idempotency headers. Warning-only for a week.
3. **Baseline the schema** with `supabase db pull` into `supabase/migrations/`, and require an
   `-- order:` header on every new migration. Apply by hand.
4. **Add the post-promote smoke job** (stage C): call `lib/dataIntegrity.ts`'s 8 checks once after a
   production deploy, diff against the previous `integrity_checks` row per `check_name`, alert on
   any new `fail`. No PR reads production, ever.
5. **Enable deployment protection on previews** before one points at real athlete data.
6. **Then consider Supabase branching** for previews — it needs §3's migrations and §5's seed.

**Anti-recommendation — do not have CI apply migrations automatically on merge to `main`.** The
natural finish to §3, and it fails on three independent grounds. **(i) It inverts an ordering
constraint the repo already documents.** `fix-biomech-reports-private.sql:13-16` must run *after* its
code deploys; a runner firing on merge runs it before Vercel finishes promoting, breaking every
existing report URL for the length of a build — and roughly one migration in five here is
after-deploy shaped. **(ii) There is no trustworthy baseline to apply against.** 32 scripts were
pasted in by hand over months with no `schema_migrations` record and no guarantee a file wasn't
edited post-apply; a runner meeting that schema for the first time diffs against a state it did not
create — which is how a "no-op" migration drops a column. **(iii) The rollback asymmetry is fatal.**
Code reverts atomically via Instant Rollback; DDL on an 8.88M-row, 29-index table does not revert and
may not finish inside the platform's 8s statement ceiling — the ceiling that silently zeroed
`stuff_plus` coverage. Automating the one irreversible step, to save a paste that happens a few times
a month, trades catastrophic risk for trivial convenience. **Lint migrations in CI; apply them with a
human.**

**Highest-leverage next action:** one PR that fixes the 5 failing tests and adds `ci.yml` running
`tsc --noEmit`, `eslint`, and the non-integration Vitest suite as a required check on `main`. Under
an hour, 90 seconds per PR — and until it exists, every other recommendation in Cas's testing domain
is advice no machine enforces.

---

## Sources

1. [Fowler — *Continuous Integration*](https://martinfowler.com/articles/continuousIntegration.html) — the every-commit-builds standard §1 measures Triton against.
2. [Fowler — *Evolutionary Database Design*](https://martinfowler.com/articles/evodb.html) — schema as versioned artifact; §3's baseline-then-forward path.
3. [Fowler — *ParallelChange*](https://martinfowler.com/bliki/ParallelChange.html) — the expand/contract sequence §4's table encodes.
4. [ankane/strong_migrations](https://github.com/ankane/strong_migrations) — which DDL takes blocking locks; §8(iii)'s ceiling risk.
5. [Vercel — Preview deployments](https://vercel.com/docs/deployments/preview-deployments) — what a preview build is, for §5's first row.
6. [Vercel — Environment variables](https://vercel.com/docs/environment-variables) — per-environment scoping; the default making §5's inference likely.
7. [Vercel — Cron jobs](https://vercel.com/docs/cron-jobs) — crons fire only on production deployments (§4).
8. [Vercel — Deployment protection](https://vercel.com/docs/deployment-protection) — the control §5 wants before previews hold athlete data.
9. [Vercel — Instant rollback](https://vercel.com/docs/deployments/instant-rollback) — the atomic code revert Postgres has no equal for (§4, §8).
10. [Vercel — Skew protection](https://vercel.com/docs/skew-protection) — why both builds stay live during a promote (§4).
11. [Supabase — Branching](https://supabase.com/docs/guides/deployment/branching) — ephemeral per-PR databases; §5's option 2.
12. [Supabase — Database migrations](https://supabase.com/docs/guides/deployment/database-migrations) — the `supabase/migrations/` layout §3 adopts.
13. [Supabase CLI — `db pull`](https://supabase.com/docs/reference/cli/supabase-db-pull) — produces §3's baseline from the live schema.
14. [Supabase CLI — `db push`](https://supabase.com/docs/reference/cli/supabase-db-push) — the apply step §8 keeps manual.
15. [GitHub — Workflow syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions) — `on:` and `concurrency` as used in §2.
16. [GitHub — Security hardening for Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions) — secrets withheld from fork PRs (§2).
17. [GitHub — Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) — required checks, without which §2 is advisory.
18. [Next.js — TypeScript config](https://nextjs.org/docs/app/api-reference/config/next-config-js/typescript) — builds fail on type errors unless `ignoreBuildErrors` (§1).
19. [Next.js 16 — Upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) — `next lint` removal; why §2 calls `eslint`.
20. [dbt — CI jobs](https://docs.getdbt.com/docs/deploy/ci-jobs) — prior art for gating a deploy on data tests, and the model §6 declines.

**Triton-internal evidence.** Repo reads and the local test run on **2026-08-13**; **no production
database was queried and no deploy was triggered** — production numbers come from the central
2026-08-12 pass. CI **(verified)**: `.github/workflows/` holds exactly one file, `retro-ingest.yml`
(`schedule: '0 12 * * 0'` + `workflow_dispatch`, lines 3–17; steps run Chadwick, `npm ci`,
`check-retrosheet-release.js`, `ingest-retrosheet.ts`, `validate-retrosheet.ts` — never `vitest`,
`tsc`, `eslint`); `grep -rn pull_request .github/` returns nothing. Suite **(verified)**:
`npx vitest run __tests__/lib __tests__/api` → 6 files, **98 tests, 93 passed / 5 failed**, tests
23 ms, duration 199 ms, 0.55 s wall; failures are the `.maybeSingle()` gap at `lib/queryCache.ts:22`
(`queryCache.test.ts:31,37,70,78`) and `leagueStats.test.ts:37-41`. Integration skip **(verified)**:
`savantValidation.test.ts:17-20,38` (`describe.skipIf(!hasEnv)`) against `vitest.config.ts:11`
(`setupFiles: ['dotenv/config']`) with no `.env` present. Build config **(verified)**:
`package.json:6-11` (`"lint": "eslint"`, no `typecheck`); `next.config.ts` sets neither
`typescript.ignoreBuildErrors` nor `eslint.ignoreDuringBuilds`. Migrations **(verified)**:
`supabase/` holds only `.temp/` (`project-ref` = `xgzxfsqwtemlcosglhzr`, 2026-04-27); no
`supabase/migrations/`; `ls scripts/*.sql` = **32**;
`grep -rl schema_migrations scripts/ lib/ app/` returns nothing; manual-apply headers at `create-email-tables.sql:2`,
`enable-rls.sql:9`, `migrate-newsletter-encryption.sql:2`, `fix-security-advisories.sql:7,18,371`,
`docs/retrosheet.md:40-41`; ordering at `fix-biomech-reports-private.sql:13-16`. Cron drift **(verified)**: `ls app/api/cron/` = 17 dirs;
`vercel.json` = 18 entries over 16 distinct paths — 15 cron handlers plus `/api/game/warmup`;
`challenges` and `newsletter` have none; `CRON_SECRET` checks at
`app/api/cron/pitches/route.ts:22`, `app/api/cron/integrity/route.ts:19`. Data checks
**(verified)**: `lib/dataIntegrity.ts` = 433 lines exporting 8 checks (`checkUnknownPlayers`,
`checkOrphaned{Pitchers,Batters}`, `checkNewPitchNames`, `checkSeasonConstants`,
`checkMaterializedViews`, `checkLeagueAverages`, `checkPitchBaselines`), invoked at
`app/api/cron/integrity/route.ts:25-35` via `Promise.allSettled` into `integrity_checks`
(`scripts/create-integrity-checks.sql:4-14`). Cadence **(verified)**: 85 commits, 2026-06-13 to
2026-08-12. Carried from the 2026-08-12 packet, not re-measured: 195 API route handlers, 17 cron jobs, 15 route
groups; `CLAUDE.md` naming 6 routes and 3 groups, `players` 4,017 vs **16,931**, `pitches` 7.4M vs
**~8.88M**; `league_averages` stale **46 days**; ≈**249k** rows re-scored 2026-08-11;
`last_analyze`/`last_autoanalyze` NULL on all nine tables inspected; ~20 concurrent readers causing
~1 hour of Supabase downtime.
