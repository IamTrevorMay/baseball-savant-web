# Specialist Agent Brain — Build Contract

How to build the reference docs behind `jo`, `li`, and `cas`. Read this before any fan-out.
Deviating from the doc contract makes the brain internally inconsistent, which is worse than
leaving a doc unbuilt.

## The four-way split

Soto designs the baseball · **Jo** keeps the data alive · **Li** keeps the numbers honest ·
**Cas** keeps the surface truthful. Each agent definition in this directory carries explicit
handoff rules to the other three. A doc that strays into a sibling's territory should hand off
by filename, not absorb the topic.

## Build state

| Agent | Reference docs | Applied playbooks | Directory |
|---|---|---|---|
| Jo | 33/33 ✅ | 3/3 ✅ | `Jo/` |
| Li | 44/44 ✅ | 0/4 | `Li/` |
| Cas | 44/44 ✅ | 0/4 | `Cas/` |

**Directories live at the repo root** (`Jo/`, `Li/`, `Cas/`), not under `.claude/agents/` — only the
persona files (`jo.md`, `li.md`, `cas.md`) and this contract live here.

`README.md` inside each agent directory is the authoritative manifest — `[x]` built, `[ ]` planned.
**Verify against `ls`, not against the manifest**: on 2026-08-12 two Li docs were fully built on
disk but still marked `[ ]`. Reconcile both directions before dispatching.

Remaining: **8 docs**, all applied playbooks — Li 4, Cas 4. Jo is complete. Playbooks synthesize an
agent's own reference docs.

Resume order: Li's 4 applied playbooks, then Cas's 4.

### Batch log

- **2026-08-12** — Li `entity-resolution` 01–11 and `temporal-modeling` 01–09 built in one 20-way
  fan-out (Li 15/44 → 35/44). All 20 verified in spec.
- **2026-08-13** — Li's last 9 gaps + Cas `testing-data-systems` 01–11 (**Li 44/44 ✅, Cas 11/44**).
  Also repaired three bad citations found by the new checker, two of them in docs built earlier:
  a non-resolving Casella 1985 DOI (real paper, wrong DOI — the exact failure mode this contract
  warns about), a dead `sabr.org/journal/`, and a dead `postgresql.org/.../brin-intro.html`.
  **Lesson: every batch needs `--links`; Jo's 33 docs have never been link-checked.**
- **2026-08-13** — Cas `analytics-ux` 01–11, first **light-tier** batch (**Cas 22/44**). 11/11 passed
  structure and links first time; no trim pass. Findings this batch surfaced in shipping UI, each
  verified independently before being accepted: `pitcherStats.ts:292` silently substitutes `stuff_rv`
  for `stuff_plus` under the same label below 50% coverage (the likely reason the 3-month coverage
  outage stayed invisible on screen); `getCellColor` colors NULL as *below-average* because
  `Number(null)===0` clears the `isNaN` guard; `TileViz.tsx:134-138` fabricates empty heatmap bins
  from neighbours and hovers them to 3 decimals; `RollingAverages.tsx:10` sets its smoothing window
  from the *filtered* row count, so apparent volatility tracks the user's filter; `PitchMovement.tsx`
  omits `scaleanchor` on inch-by-inch axes while `MovementProfile.tsx` sets it; zero
  `loading.tsx`/`error.tsx` across 96 pages. A briefing assumption of mine ("red/green is load-bearing")
  was **wrong** and the agent corrected it — 5 of 6 `plus` specs use CVD-safe teal/orange.

- **2026-08-21** — Cas `frontend-data-scale` 01–11, second light-tier batch (**Cas 33/44**). 11/11
  PASS on `--light --links` first time, 15,682–15,808 B, 11–14 sources, zero dead links. Also this
  session: Jo's 33 docs were link-checked for the first time (6 real dead links found, listed below);
  Jo's manifest had **15 built docs still marked `[ ]`**, since corrected; and `check-doc.sh` gained
  two fixes — it now counts inline-flow `tags: [a, b]` (5 Jo docs used it and were reported
  `tags=0`), and reports HTTP **203** as `UNVERIFIABLE[bot-challenge]` rather than DEAD (pubmed
  serves a challenge page). Dead links still to repair in Jo: `dqglobal.com` DAMA-UK dimensions PDF,
  `nannyml.com/blog/comprehensive-guide-univariate-methods`,
  `shopify.engineering/iteration-as-a-service`, `synq.io/blog/data-observability-guide`,
  `soda.io/resources/no-bs-guide-to-data-quality-dimensions`, `loke.dev/blog/node-fetch-timeout-connection-leak/`.

  **Three of my own briefing claims were wrong and the agents caught all three** — the packet was
  corrected on disk mid-flight and later agents picked the correction up, which worked. (1) "All 57
  `<tbody>` surfaces render every row" — false; most are bounded upstream (`PitchLogTab.tsx:29`
  paginates at 50). (2) "Every `run_query` is capped at 8s, which is why filtering is client-side" —
  too strong; `run_query_long` carries a **function-level** `statement_timeout=120s` and
  `/api/player-data` uses it. (3) I then "corrected" that to "the real limit is unverifiable from the
  repo" — also wrong; `planning.md:40,46,304` documents the whole timeout hierarchy. **Read
  `planning.md` before writing the next packet.**

  **Light tier still needs a trim pass**, contrary to the 08-13 note: docs 01 and 06 each reported
  ~6 passes (21,993 B → 15,682 B for 01). What worked was *deleting* content — TL;DR bullets,
  sources, table rows — not compressing sentences, which recovered only 200–500 B per full rewrite.
  Tell trimmers to cut whole items.

- **2026-08-21** — Cas `caching-state` 01–11 (**Cas 44/44 ✅ — all four reference libraries done**).
  11/11 PASS on `--light --links`, 15,584–15,868 B, 10–13 sources, zero dead links.

  **Three agents were killed by the 600 s stall watchdog *during the trim loop*, not while drafting**
  (01, 04, 07). All three had already written a full draft; 04 had actually finished and passed
  untouched. 01 and 07 were trimmed by hand. **Budget trimming as its own stage and expect the
  watchdog to fire during it** — a trim loop makes many small edits with no visible progress.

  **The trim lesson is now confirmed by seven independent agents plus my own hand-trimming, and the
  earlier "light tier needs no trim pass" note (2026-08-13) is wrong.** First drafts landed at
  21,242–25,290 B — 1.35× to 1.6× the cap — with the cap stated in every prompt. Doc 08 took **ten**
  passes. Rewording recovers 30–300 B per full-file pass and sometimes *increases* size; only
  deleting whole items moves the number (a TL;DR bullet, a source, table rows, a code block, a whole
  paragraph). Merging two duplicate tables into one recovered ~900 B in a single edit.
  **Change the dispatch prompt to ask for ~12,000 B**, not "aim 15,000–15,600" — agents fill to
  whatever number they are given and only respect the cap. Two traps when trimming to the wire: the
  checker counts source *lines*, so cutting sources for size can drop you under the 10-source floor;
  and `wc -c` runs ~140 B above character count on these docs because of em-dashes, `×`, `→`, `≈`.

  **Search budget is a solved problem.** Capping agents at ~7 searches and telling them to prefer
  `WebFetch` on canonical URLs worked — several agents used **zero** `WebSearch` calls. Fetches do
  not bill the search budget. Use this instead of raising the cap.

  **Two more of my own briefing claims were wrong and the agents caught both**, continuing the
  pattern from the previous batch. (1) "No UI component reads `mv_last_refreshed`" — false;
  `app/(admin)/admin/page.tsx:67,207-209` renders it. The true claim is "no *analyst-facing* surface
  reads it." Hazard #5 in `Cas/context/triton-context.md` carried the same half-false wording since
  2026-08-11 and is now corrected. (2) "`Promise.all` means one rejection abandons the other
  operation" — false; both promises start eagerly and nothing is cancelled. The defensible charges
  are that the `await` settles on the first rejection and that two outcomes collapse into one bit.
  A third briefing premise (two users fighting over one Kanban card) was too strong: `work_tasks` is
  single-writer by RLS, admins get `SELECT` only.

  **Found a broken cross-agent reference that the checker does not catch:** three docs cited
  `Jo/pipeline-observability/`, which has never existed (Jo's domains are `data-reliability`,
  `postgres-performance`, `data-quality`). One was in the already-committed `frontend-data-scale`
  batch. **`check-doc.sh` should validate `Agent/domain/` paths the way it validates source URLs.**

## Doc contract

1. **YAML frontmatter** — `title`, `domain`, `tags` (6–8), `sources_reviewed` (int), `last_updated`.
2. **`# Title`** matching frontmatter, in the form `Topic — Plain-English Angle`.
3. **`## TL;DR`** — 8–12 bullets. Each is a **bolded claim** ending in a parenthesized evidence
   grade. Claims, not topics: "Provenance is the only one that cannot be reconstructed later",
   not "This doc covers provenance."
4. **Numbered sections** (`## 1.`, `## 2.`, …), `###` subsections where useful. Tables are
   strongly preferred over prose for any comparison.
5. **Penultimate section: "What Triton should do, in order"** — a numbered, ordered list, then a
   bolded **Anti-recommendation** naming the plausible-but-wrong move and killing it on 2–3
   independent grounds, then a **single highest-leverage next action**.
6. **`## Sources`** — 17–24 real, annotated, resolvable links. Annotation says what the source
   supplies to *this* doc, not what the source is about.
7. **Final paragraph: `**Triton-internal evidence.**`** — the code paths (with `file:line`),
   measured numbers, and dates behind every `(computed)` claim in the doc.

### Applied-playbook contract (differs from the reference-doc contract above)

A playbook is a **sequenced build plan**, not research. It synthesizes one agent's own reference
domain into work someone can start on Monday. `Soto/applied/` (7 docs, 2026-07-19) established the
spine; those predate this contract and carry no citations, which is the one thing we do not copy —
a playbook proposes real code changes, so every item must say where it applies and how well it is
known.

1. **YAML frontmatter** — `title` (ending `— Applied Playbook`), `domain: applied`, `tags` (6–8),
   `last_updated`. **No `sources_reviewed`**: playbooks cite the repo and their own domain, not the
   literature.
2. **`# Title`** matching frontmatter.
3. **`## TL;DR`** — 8–12 bullets, each a **bolded claim** ending in a parenthesized evidence grade,
   same per-agent vocabulary as the reference docs.
4. **`## NOW (0–6 weeks)`** · **`## NEXT (6 weeks – 6 months)`** · **`## LATER (6+ months)`** —
   ordered work. **Every item carries a `file:line` and a grade.** An item nobody can locate in the
   repo is not actionable and does not belong in a playbook.
5. **`## Standing Rules`** — the invariants that apply to every item above.
6. **Final paragraph: `**Triton-internal evidence.**`** — the `file:line` citations, measured
   numbers, and dates behind every `(measured)` / `(verified)` / `(computed)` claim.
7. **No `## Sources` section.** A playbook that needs to argue from the literature should cite its
   own reference doc by filename instead — that is what the domain corpus is for.

**Size: 14.0–22.0 KiB (cap 22,528 B).** A playbook synthesizes 11 reference docs and needs more room
than a light-tier doc. Check with `./.claude/agents/check-doc.sh <Agent> --applied <files>`.

**`Soto/applied/`'s 7 playbooks predate this contract and fail `--applied`** — no `file:line`
citations, no evidence paragraph, 6–7 TL;DR bullets, one oversized at 28 KB. Do not rewrite them;
they are correct, just older, exactly as with Jo's oversized reference docs. The contract applies to
the 11 playbooks built from here.

**Build them per agent, not all at once.** Each playbook reads its own domain's 11 docs, so a
per-agent batch shares one briefing and gives a checkpoint between agents. 11 concurrent long
syntheses is also what tripped the stall watchdog on 2026-08-21.

### Evidence grades — differ per agent, do not mix

| Agent | Grades |
|---|---|
| Jo | `measured` / `documented` / `inferred` / `folklore` |
| Li | `established` / `computed` / `estimated` / `folk-sabermetrics` |
| Cas | `verified` / `documented` / `inferred` / `cargo-cult` |

### Doc tiers

Two tiers exist. **Structure is identical in both** — same frontmatter, same TL;DR bullet count, same
numbered sections, same "What Triton should do, in order" + Anti-recommendation + next action, same
`**Triton-internal evidence.**` paragraph, same per-agent grade vocabulary. Only depth differs.

| Tier | Size | Sources | Research budget | Used for |
|---|---|---|---|---|
| **standard** | 15.0–22.0 KiB (cap 22,528 B) | 17–24 | ~25 searches/doc | Jo 33, Li 44, Cas `testing-data-systems` |
| **light** | 9.0–15.5 KiB (cap 15,872 B) | 10–14 | ~10 searches/doc | Cas `analytics-ux` onward |

**Observed:** light-tier docs land at 15,672–15,870 B — agents fill whatever headroom the *cap*
allows and ignore the stated target band, exactly as they did at 22 KiB. The cap is the only control
that works. But at this tier they self-verified and **no trim pass was needed** (11/11 passed first
time), which was the expensive failure at standard tier.

Check with `./.claude/agents/check-doc.sh <Agent> [--light] [--links] <files>` — `--light` swaps the
size and source bounds. **A doc's tier must match its domain**; mixing tiers inside one domain is the
inconsistency the contract exists to prevent.

**Why a light tier.** The reference docs' value is concentrated in the Triton-specific analysis —
the `file:line` grounding, the measured numbers, the anti-recommendation. General background is the
compressible part. The light tier keeps the former and cuts the latter, and it removes the trim pass
because agents no longer have to be talked down from 27 KB.

### Hard size cap: 22 KB (standard tier)

The cap is **22 KiB = 22,528 bytes**. Non-negotiable and must be stated **in the dispatch prompt** —
agents overshoot ~1.5× without it. Jo's `postgres-performance` and `data-reliability` docs predate
enforcement and run 17–35 KB (avg 27). Do not rewrite the oversized ones; they are correct, just long.

**Stating the cap is not sufficient.** On 2026-08-12, 17 of 20 docs landed over it (22.5–27.9 KB)
despite every prompt carrying the cap. Budget for a **trim pass** as a normal build stage, not an
exception. Ask for **≤ 22,300 bytes** so there is margin, and tell the trimmer to compress prose
density only — never sections, sources, tables, claims, or numbers.

## Fan-out rules

- **Never let subagents query the production database.** ~20 concurrent readers took Supabase
  down for roughly an hour. Say so explicitly in every dispatch prompt.
- **Measure once, distribute.** The `(computed)`/`(measured)` claims that make these docs good
  depend on real production numbers. Gather them in a **single** pass before dispatching and
  paste the results into each subagent's prompt as a briefing packet. Subagents may read the
  repo freely — that is where `file:line` citations come from — but the database is read once,
  centrally.
- Each subagent gets: its manifest line, the doc contract above, its agent's `context/triton-context.md`,
  its agent's grade vocabulary, the 22 KB cap, and the shared measurement packet.
- Subagents must cite real, resolvable sources. A fabricated citation is the one failure mode
  that silently destroys the brain's value.
- **Wait for genuine quiescence before dispatching a trim pass.** A completion notification is not
  the same as the file being finished, and a size measurement taken mid-write is stale. On
  2026-08-12 trims launched against still-being-written files, and two trimmers had to detect and
  restore content a concurrent write had dropped (`temporal-modeling/04` lost 8 specific items;
  `05` lost a table row, two row counts, and two citations). They caught it — but nothing
  guarantees that. Poll until no `.md` in the tree has been modified for ~2 minutes, *then* trim.
- Update the manifest checkbox only after confirming the file exists on disk at a plausible size.

### Verify every batch with `check-doc.sh`

```bash
./.claude/agents/check-doc.sh Li Li/entity-resolution/*.md          # structure only (fast)
./.claude/agents/check-doc.sh Li --links Li/entity-resolution/*.md  # + probe every source URL
```

Structure and grade vocabulary are easy to get right and easy to check; **citations are neither**.
Run the checker over each finished batch — it validates frontmatter, tag count, TL;DR bullet count,
the required sections, size, source count, and cross-agent grade contamination, and with `--links`
probes every source URL.

Two gotchas it encodes, both learned the hard way:
- Treat **202/401/403/406/429** as alive (DOI resolvers return 202; Fangraphs and others bot-block)
  and **000** as *unverifiable from this sandbox*, not dead (`stlouisfed.org` is network-blocked here).
- Extract URLs with a **balanced-paren** match. A naive `[^)]` regex truncates legitimate URLs like
  `…/wiki/Doubleheader_(baseball)` and reports them as 404s.

Real dead links found on 2026-08-12: `chadwickbureau/baseballdatabank` (**repo retired** — the
Chadwick org no longer has it; Lahman is distributed via <https://sabr.org/lahman-database/>) cited
in 6 docs, a dead CMU personal-homepage PDF, and `postgresql.org/docs/current/brin-intro.html`
(correct page is `brin.html`).

## Web-search budget

Roughly **25 searches per doc**. Subagent searches bill to the **parent session's** budget, so a
20-way fan-out drains it ~20× faster — this is what killed the 2026-08-11 build at the default
200 cap.

`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` is set to `2000` in `.claude/settings.local.json`
(gitignored, so it is per-machine — re-add it on a new machine). It is read at **process start**;
changing it requires restarting Claude Code. The counter is per session and resets on a new one.

At ~25/doc, 84 docs needs ~2,100 searches — more than one session's budget. Plan on batching
across sessions and checkpointing the manifests between batches.
