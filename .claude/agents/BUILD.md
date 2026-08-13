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
| Jo | 33/33 ✅ | 0/3 | `Jo/` |
| Li | 44/44 ✅ | 0/4 | `Li/` |
| Cas | 22/44 | 0/4 | `Cas/` |

**Directories live at the repo root** (`Jo/`, `Li/`, `Cas/`), not under `.claude/agents/` — only the
persona files (`jo.md`, `li.md`, `cas.md`) and this contract live here.

`README.md` inside each agent directory is the authoritative manifest — `[x]` built, `[ ]` planned.
**Verify against `ls`, not against the manifest**: on 2026-08-12 two Li docs were fully built on
disk but still marked `[ ]`. Reconcile both directions before dispatching.

Remaining: **33 docs** (Cas 22, applied 11). Applied playbooks synthesize the reference docs, so
they go last, per agent, once that agent's four domains are complete.

Resume order: Cas `frontend-data-scale/` 01–11 → Cas `caching-state/` 01–11 → the 11 applied
playbooks. Both remaining Cas domains use the **light** tier.

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
