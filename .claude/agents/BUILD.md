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
| Li | 15/44 | 0/4 | `Li/` |
| Cas | 0/44 | 0/4 | `Cas/` |

`README.md` inside each agent directory is the authoritative manifest — `[x]` built, `[ ]` planned.
**Verify against `ls`, not against the manifest**: on 2026-08-12 two Li docs were fully built on
disk but still marked `[ ]`. Reconcile both directions before dispatching.

Remaining: **84 docs** (Li 29, Cas 44, applied 11). Applied playbooks synthesize the reference
docs, so they go last, per agent, once that agent's four domains are complete.

Resume order: Li `entity-resolution` → Li `temporal-modeling` → Li's 7 remaining
governance/inference gaps → Cas's 44 → the 11 applied playbooks.

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

### Hard size cap: 22 KB

Non-negotiable and must be stated **in the dispatch prompt** — agents overshoot ~1.5× without it.
Jo's `postgres-performance` and `data-reliability` docs predate enforcement and run 17–35 KB
(avg 27). Everything written after lands at 21.5–22.0 KB. Do not rewrite the oversized ones;
they are correct, just long.

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
- Update the manifest checkbox only after confirming the file exists on disk at a plausible size.

## Web-search budget

Roughly **25 searches per doc**. Subagent searches bill to the **parent session's** budget, so a
20-way fan-out drains it ~20× faster — this is what killed the 2026-08-11 build at the default
200 cap.

`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` is set to `2000` in `.claude/settings.local.json`
(gitignored, so it is per-machine — re-add it on a new machine). It is read at **process start**;
changing it requires restarting Claude Code. The counter is per session and resets on a new one.

At ~25/doc, 84 docs needs ~2,100 searches — more than one session's budget. Plan on batching
across sessions and checkpointing the manifests between batches.
