---
title: Triton / Neptune / Trevor Context
domain: context
tags: [context, triton-platform, neptune-performance, trevor-may]
last_updated: 2026-07-19
---

# The Platform, Facility, and Operator Soto Serves

> This is the ground-truth context doc. Every `applied/` doc and every piece of Soto's advice
> should be framed against what's written here. Items marked *(assumption)* should be confirmed
> with Trevor and corrected in place.

## The Operator (and the Athlete)

- **Trevor May** — founder/operator. Former MLB pitcher (Minnesota Twins, New York Mets, Oakland
  Athletics, 2014–2023; career-best 21 saves in his final 2023 season with Oakland). Underwent
  Tommy John surgery in 2017 and returned to a multi-year late-career run — he has lived the
  rehab/return arc Soto advises on. Now a partnered Twitch streamer, YouTuber, and entrepreneur
  running a creator-led media company (Mayday Media) and building software.
- Soto's implication: Trevor is simultaneously the **client** (his own training and long-term arm
  health), the **coach** (Neptune's development philosophy flows through him), and the
  **engineer's product owner** (Triton's metrics are his design decisions). Advice can be
  technical — he has both pro-level feel and developer-level data literacy. Do not oversimplify.
- Trevor's personal training goals are not yet documented here *(assumption: staying-sharp
  training, demos/content, and coaching credibility rather than a competitive comeback — confirm
  and correct in place)*.

## Business 1: Triton (this repo — baseball analytics platform)

- TruMedia-style analytics platform: Next.js 16 + Supabase (Postgres + Realtime), Plotly, Vercel.
- **Data assets:** `pitches` (7.4M+ Statcast rows, 2015–2026), `milb_pitches` (AAA, 2023+),
  Retrosheet historical DB (PBP 1914+), TrackMan Compete tables (`compete_pitches`), players,
  league averages.
- **Existing in-house models Soto owns and refines:**
  - **Stuff+** — Z-score model: `100 + veloZ*4.5 + moveZ*3.5 + extZ*2.0`, clamped [0,200],
    per pitch_name/game_year baselines in `pitch_baselines`. DB backfill ~5.1M rows; client
    fallback `computeStuffRV()` in `lib/leagueStats.ts`.
  - **Command metrics** — `pitcher_season_command` table (raw Triton command metrics + plus stats).
  - **Deception** — `pitcher_season_deception` (`deception_score`, `unique_score`, 2017+).
  - League averages: 50th-percentile benchmarks per (season, level, role, metric); SP/RP
    classification = ≥3 games with 50+ pitches → SP.
- **Key surfaces:** pitching dashboard (`app/player/[id]`), Reports Builder, Compete section
  (TrackMan CSV upload + session browser), broadcast/producer system, AI analyst chat.
- **Conventions Soto must follow when hands-on:** metric/param changes update `docs/VARIABLES.md`
  same commit; ad-hoc DB queries logged to `docs/Queries.md`; mutations via `run_mutation` RPC
  (`run_query` is SELECT-only); disk pressure on 8GB plan — VACUUM between large batch updates;
  never push without explicit approval.
- Soto's algorithm work here: refining Stuff+/command/deception, building new metrics (biomech-
  informed features, TrackMan-based facility metrics), projection/aging work on the Retrosheet
  spine, and athlete-facing Compete analytics.

## Business 2: Neptune Performance (baseball development lab — in buildout)

- A **new physical baseball training / player-development facility** in buildout under a
  multi-phase BD program (tracked in the Mayday Studio app; no launch target date set as of
  2026-07-12).
- Positioning (per Carl's facility research): tech-forward **"development lab"** model —
  Driveline-style assessment + individualized programming — commands 3–10x the price per athlete
  of a commodity cage barn. Trevor's pro credibility + Mayday Media's content engine is the
  primary customer-acquisition channel.
- Soto's implication: Neptune needs an **assessment → programming → monitoring** product spine.
  Soto designs it: intake assessment battery, tech stack (TrackMan already in hand via Compete;
  force plates, bat sensors, mocap/IMU under evaluation *(assumption)*), athlete programming
  templates, arm-care/workload monitoring, and the Triton-powered data layer that differentiates
  the facility.
- Target clientele not yet documented *(assumption: youth/travel + HS, possibly college/pro
  offseason — confirm age bands, since arm-care guidance and pricing differ sharply by age)*.

## Business 3: The Compete data pipeline (facility ↔ platform bridge)

- `compete_pitch_sessions` / `compete_pitches`: TrackMan CSV ingest + persistent session browser,
  already live in Triton. A separate Data-app TrackMan ingest ("Vision Live") exists, paused
  2026-05-26.
- This is the pipeline Neptune athlete data will flow through — Soto's facility metrics, athlete
  dashboards, and progress tracking build on it.

## Standing Constraints & Preferences

- Small team; founder time is the scarcest resource. Prefer leverage (systems, templates,
  automation) over headcount.
- Evidence-graded advice only — Trevor has seen every flavor of baseball bro-science and will
  discount ungraded claims.
- The platform is built and modified rapidly with AI assistance; recommendations should be
  shippable in that mode (incremental, high-value-per-change).
- Dark theme (zinc-950, emerald accents), TruMedia-style density for any UI Soto specs.
