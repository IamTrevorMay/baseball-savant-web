---
title: Broadcast Overlay Legibility — Designing for a Moving, Compressed, Phone-Sized Screen
domain: analytics-ux
tags:
  - broadcast-overlay
  - legibility
  - safe-areas
  - contrast
  - compression
  - obs
  - dwell-time
  - typography
sources_reviewed: 14
last_updated: 2026-08-13
---

# Broadcast Overlay Legibility — Designing for a Moving, Compressed, Phone-Sized Screen

## TL;DR

- **The 1920×1080 canvas is a coordinate system, not a screen size.** A ~390 px phone viewport scales it 0.203×, so a 14 px stat label lands at **2.8 CSS px** and the 32 px headline at 6.5 px. **(verified)**
- **56 of 72 numeric font sizes in `components/producer/` are ≤16 px and 27 are ≤11 px; the largest anywhere is 32 px** — 3.0% of picture height, against a broadcast authoring floor near 8%. **(verified)**
- **Not one `text-shadow`, `-webkit-text-stroke`, or `paint-order` exists in the overlay or producer trees.** Every glyph depends on its scrim; where the scrim thins there is no fallback. **(verified)**
- **Safe areas are a legacy of analog overscan, not a requirement of a browser source** — but scalers, player chrome and phone insets crop the frame anyway, and **both producer panels sit outside title-safe**: 48 px and 28 px from the edge against EBU R 95's 96 px H / 54 px V. **(documented + verified)**
- **`#71717a` label text — used 20+ times — is 4.12:1 on the panel and ~3.48:1 once the 0.92 scrim composites over bright video**, below WCAG AA at the sizes used; the lower third's weaker `rgb(9 9 9 / 0.6)` drops 16 px white text to ~5.3:1. **(verified)**
- **Compression attacks exactly what these panels are made of.** 1080p60 at Twitch's 6,000 kbps ceiling is **0.048 bits/pixel**, and 4:2:0 leaves a 13 px colored glyph ~6.5 px of chroma — all `ComparisonRenderer` uses to separate two players. **(documented)**
- **Dwell time is an operator's thumb, not a schedule.** Stream Deck and hotkeys fire the show, the shared channel can replace content mid-read, and no minimum on-air duration is enforced. **(verified)**
- **Four licensed broadcast faces load on the overlay route and the eight presets use none of them,** inheriting Inter — and all four are `font-display: block`, i.e. invisible text after an OBS source refresh. **(verified)**
- **"Make it bigger" as the whole fix is cargo-cult.** Size without stroke still dies on a white uniform, and size without a safe-area budget pushes text further off-frame. **(cargo-cult)**

---

## 1. The canvas lies about the screen

Everything in `app/overlay/**` is authored in absolute pixels against a fixed 1920×1080 box (`overlay.css:1–7`). OBS composites that 1:1 into a 1080p program, so on the operator's preview a 14 px label is 14 px — it never reaches a viewer that way.

| Surface | Scale | 14 px label | 32 px headline |
|---|---|---|---|
| OBS preview / 1080p desktop | 1.00× | 14 px | 32 px |
| 720p transcode | 0.67× | 9.3 px | 21 px |
| Phone portrait, ~390 px viewport | 0.203× | **2.8 px** | 6.5 px |

The only device-independent unit is **percent of picture height**, which is why broadcast specs are written that way. BBC's authoring requirement for subtitles is a line height of **8% of active video height**, ~86 px at 1080. Triton's maximum is 32 px (3.0%), its typical stat value 20 px (1.9%), the movement chart's axis labels 8–9 px (0.74–0.83%): a **3–6× shortfall against the most permissive published floor** — a floor set for one centered line of prose, not a five-column table.

---

## 2. Safe areas — the rule's origin, and where Triton sits

Action-safe and title-safe come from analog CRT overscan: tubes were driven larger than the visible faceplate, and 5–10% of the frame could be lost on any given set. **No modern flat panel overscans, and a browser source composited into a digital program has no overscan at all** — the convention is not a technical necessity today. It is still the right budget, for three reasons that outlived the CRT: 4:3/9:16 crops for social cutdowns, player chrome on the bottom strip, and phone insets.

| Rule | Inset | At 1920×1080 | Triton's panels |
|---|---|---|---|
| EBU R 95 action safe | 3.5%/edge | 67 px H / 38 px V | lower bar spans y 940–1080; its bottom 38 px is outside |
| EBU R 95 graphics safe (= title safe, the 90% box) | 5.0%/edge | 96 px H / 54 px V, i.e. 1728×972 | right-panel text ends 28 px from the right edge; lower-bar text starts 48 px from the left |

Both panels put readable text at **half the required edge distance or less**. Vertical centring saves most single-line lower-bar content, but `StatLineRenderer`'s variant stacks a 22 px name over a 12 px team line whose baseline crosses the 1026 px title-safe boundary. No safe-area constant exists anywhere in the repo. **(verified)**

---

## 3. Contrast, computed against the actual hex values

The panels' near-opaque scrim, `linear-gradient(rgba(9,9,11,0.92) → rgba(9,9,11,0.98))`, is good design. But 8% of the video shows through at the top of the bar, and the palette came from a `zinc-950` dashboard where the background is guaranteed.

| Foreground | On panel | Over bright video (α=0.92) | Where used |
|---|---|---|---|
| `#e4e4e7` | 15.7:1 | 13.3:1 | primary numbers — fine |
| `#a1a1aa` | 7.8:1 | 6.6:1 | secondary — fine |
| `#10b981` | 7.8:1 | ~6.6:1 | leaders, player A |
| **`#71717a`** | **4.12:1** | **~3.48:1** | headers, units, ranks, axis labels |

`#71717a` is the most-used text color in the producer renderers and fails WCAG AA (4.5:1) even on the opaque panel — and at the 9–11 px it is used at, no large-text exemption applies. The lower-third widget is worse: its topic and message blocks use `rgb(9 9 9 / 0.6)`, so over a white uniform the effective background rises to ~`#6b6b6b`, taking 16 px `#FFFFFF` from 18:1 to **~5.3:1**. Its orange topic chip (`#FF8200` on black, 8.5:1) is the one background-independent element there, because it is opaque. **(verified)**

---

## 4. Stroke, shadow, scrim — pick two

Three ways exist to make text survive an unknown background; Triton uses one.

| Technique | Cost | Failure mode | In repo |
|---|---|---|---|
| **Opaque scrim / plate** | occludes video | producer resists covering the field | yes (0.92–0.98) |
| **Stroke** (`-webkit-text-stroke`) | thickens glyphs | centered stroke eats counters at small sizes | **none** |
| **Shadow halo** (stacked `text-shadow`) | free, no layout change | soft edge | **none** |

`paint-order: stroke fill` is the load-bearing detail: without it `-webkit-text-stroke` centers on the glyph outline and half grows inward, closing the counters of `8`, `e`, `a` at 12 px. With it, the stroke paints behind the fill and grows outward only.

The pragmatic default is a 2–3 px dark halo of stacked shadows rather than a stroke — it survives the encoder, where a 1 px stroke is the first thing quantization erases. Apply it to *all* overlay text, panels included: the cost is zero and the panel's top edge is 8% transparent. **(inferred)** Palette choice itself is `06-color-encoding-accessibility.md`'s.

---

## 5. What the encoder does to a stat table

| Constraint | Number | Consequence for these panels |
|---|---|---|
| Twitch 1080p ceiling | 6,000 kbps | 0.048 bits/pixel at 60 fps, 0.096 at 30 |
| YouTube 1080p60 | 4,500–9,000 kbps | same order |
| H.264 4:2:0 chroma | 960×540 plane | a 13 px colored glyph gets ~6.5 px of color detail |
| Macroblock | 16×16 luma | 8–11 px text is *smaller than one macroblock* |

1. **Color-only encoding dies first.** `ComparisonRenderer` separates player A from B solely by `#10b981` vs `#0ea5e9` at 14–16 px; under 4:2:0 that hue is half-resolution and the first thing the rate controller discards. Add a shape or label difference. **(verified)**
2. **Hairlines vanish.** The lower bar's `borderTop: '1px solid rgba(63,63,70,0.5)'` is sub-threshold after quantization; an edge that matters needs ≥2 px at full alpha. **(inferred)**
3. **Motion spends the bitrate.** A 400 ms slide over the full 1920×140 bar is a large inter-frame delta; the encoder pays by softening everything, text included, for its duration. **(inferred)**

---

## 6. Dwell time is the operator's thumb

Transitions are tuned reasonably — 400 ms in / 350 ms out, plus the 2000/100 ms phases in `useOverlaySession`. The problem is not the animation; it is that **nothing bounds how long the graphic stays**.

- Assets fire from Stream Deck buttons and hotkeys, so on-air duration is whatever the operator does next.
- Producer panels share the main overlay's channel, so a second push replaces content **mid-read** — no exit animation, no minimum hold.
- Subtitle reading-rate specs land near 17–20 characters/second. A 10×3 leaderboard is not read linearly, but it is not readable in the 1.5 s a fast operator gives it.

Rule: **minimum on-air time should scale with density** — ~3 s for a stat line, 6 s for an arsenal table, 8 s for a 10-row leaderboard — with replacement pushes queued behind the remaining minimum. Neither is enforced. Relatedly, `TopicOverlay`'s auto-fit passes `minFontSize={0}` and decrements until the text fits *or reaches zero*, so a long topic can render at 3 px. **(verified)**

---

## 7. What Triton should do, in order

1. **Add a shared overlay text primitive** — one class applying a stacked dark `text-shadow` halo, `paint-order: stroke fill`, and `font-variant-numeric: tabular-nums`; adopt across all 8 renderers.
2. **Retire `#71717a` from overlay text.** Labels to `#a1a1aa` minimum (6.6:1 composited), values to `#e4e4e7` — a find-and-replace in `components/producer/renderers/`.
3. **Floor of 18 px, target 24 px, for any text a viewer must read**; ≤12 px only for chrome. Delete `MovementRenderer`'s 8–9 px SVG labels rather than shrink the chart around them.
4. **Introduce safe-area constants** (`SAFE_H = 96`, `SAFE_V = 54`): lower-bar padding `0 96px`, right panel moved in from the edge, and both rectangles as a broadcast-canvas toggle.
5. **Enforce a density-scaled minimum dwell** in `useProducerOverlay`, queueing replacement pushes instead of swapping mid-read; **clamp `TopicOverlay`'s `minFontSize` to 18** and truncate past that.
6. **Set `font-display: swap`** on the four `@font-face` rules, or apply those faces to the presets and preload them — today they are loaded, blocking, unused.
7. **Review at delivery scale:** screenshot, downscale to 390 px wide, re-encode at 6 Mbps before signing off.

**Anti-recommendation: do not "just scale the whole overlay up"** with `transform: scale()` or a larger base font. *Geometry:* the panels are already flush to the frame edges, so scaling pushes text further outside title-safe. *Layout:* fixed heights (`140`, `460`) mean a uniform scale overflows into `RightPanel`'s `overflow: hidden`, silently truncating rows — a correct number rendered invisibly is still a lie. *Physics:* size does nothing about contrast on a white uniform, or about 4:2:0 erasing the emerald/sky distinction.

**Highest-leverage next action:** ship items 1 and 2 in one commit — two mechanical changes, every preset improves, no layout or timing decision renegotiated first.

---

## Sources

1. EBU — [R 95: Safe Areas for 16:9 Television Production](https://tech.ebu.ch/docs/r/r095.pdf) — §2's 3.5% / 5% insets.
2. Wikipedia — [Safe area (television)](https://en.wikipedia.org/wiki/Safe_area_(television)) — the 1786×1004 / 1728×972 figures at 1080.
3. Wikipedia — [Overscan](https://en.wikipedia.org/wiki/Overscan) — why safe areas are convention, not necessity, on digital displays.
4. OBS Project — [Browser Source](https://obsproject.com/kb/browser-source) — CEF behavior, custom CSS, default transparent background.
5. Google — [YouTube live encoder settings](https://support.google.com/youtube/answer/2853702) — §5's 4,500–9,000 kbps 1080p60 range.
6. Twitch — [Broadcast Guidelines](https://help.twitch.tv/s/article/broadcasting-guidelines) — the 6,000 kbps ceiling behind 0.048 bits/pixel.
7. Wikipedia — [Chroma subsampling](https://en.wikipedia.org/wiki/Chroma_subsampling) — 4:2:0 halving chroma in both axes (the 960×540 plane).
8. W3C — [Understanding SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — the 4.5:1 threshold `#71717a` fails.
9. W3C — [Understanding SC 1.4.11: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — 3:1 for borders and chart marks.
10. W3C — [Understanding SC 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) — the timing principle behind §6.
11. W3C — [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — the relative-luminance formula behind §3's ratios.
12. MDN — [`paint-order`](https://developer.mozilla.org/en-US/docs/Web/CSS/paint-order) — stroke under fill so outlines grow outward only.
13. MDN — [`-webkit-text-stroke`](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-text-stroke) — the centered-stroke behavior that closes counters.
14. MDN — [`text-shadow`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-shadow) — stacking shadows into §4's halo.

**Triton-internal evidence.** Read 2026-08-13; no production DB queried, no broadcast session started. **Canvas:** `app/overlay/overlay.css:1–7` (transparent, 1920×1080, `overflow: hidden`); `app/overlay/[sessionId]/page.tsx:49–56,76–88` and `producer-panels/page.tsx:31–38` — transparency and the 2000/400/350/100 ms phases previously verified in `Cas/testing-data-systems/07`. **Geometry:** `LowerBarPanel.tsx:39–50` (`bottom/left/right: 0`, `height: 140`), `:52–61` (`rgba(9,9,11,0.92)→(0.98)`, `borderTop: '1px solid rgba(63,63,70,0.5)'`, `padding: '0 48px'`), `:21–25` (400 ms `cubic-bezier(0.16,1,0.3,1)` in / 350 ms `(0.7,0,0.84,0)` out); `RightPanel.tsx:33–44` (`top: 80`, `right: 0`, `width: 460`), `:46–54` (`padding: '24px 28px'`, `overflow: 'hidden'`). **Type:** 77 `fontSize` occurrences in `components/producer/`, 72 numeric, spanning 8–32 px (27 ≤11, 56 ≤16, 13 ≥20; modal values 10, 11, 14); smallest `MovementRenderer.tsx:55–56,74`, largest `CustomTextRenderer.tsx:17`. Lower-bar stack: `StatLineRenderer.tsx:79` (22 px, `lineHeight: 1.1`) over `:83` (12 px). Color-only encoding: `ComparisonRenderer.tsx:30`/`:34` (`#10b981` vs `#0ea5e9`, both `isLower ? 14 : 16`). `#71717a` recurs in all six renderers (e.g. `StandingsRenderer.tsx:17,41,55,73`). **Contrast**, from those literals via the WCAG relative-luminance formula: `#71717a` on `#09090b` = 4.12:1 → 3.48:1 once the 0.92 scrim composites over white (blend ≈ `#1d1d1f`); `#a1a1aa` 7.76 → 6.57; `#e4e4e7` 15.68 → 13.27; `#10b981` 7.84. `LowerThirdOverlay.tsx:100,158` use `rgb(9 9 9 / 0.6)` (blend over white ≈ `#6b6b6b`; 16 px `#FFFFFF` at `:171–174` → 5.33:1); its opaque `#FF8200`/black chip at `:113–118` is 8.45:1. **Gaps:** `TopicOverlay.tsx:27–55` decrements `while (fontSize >= minFontSize)`, `:124` passes `minFontSize={0}`; `grep -rn "text-shadow|-webkit-text-stroke|paint-order"` over `app/overlay/`, `components/producer/`, `app/(broadcast)/` returns **zero** matches; the only safe-area strings repo-wide are iOS `env(safe-area-inset-*)` (`app/globals.css:8–12`, `components/mobile/*`). **Fonts:** `overlay-fonts.css:1–39` declares four faces, all `font-display: block`, but `app/overlay/layout.tsx:1–9` returns a fragment, so `app/layout.tsx:2,46` (`Inter` on `<body>`) governs and `grep -rn fontFamily components/producer/` returns **zero** matches; those faces appear only in `LowerThirdOverlay.tsx:114,155,170,194` and `ChatOverlay.tsx:95,129,143`. **Dwell:** 8 presets at `PanelContent.tsx:20–40`; `lib/useOverlaySession.ts:73,94,118`; triggering via `lib/useStreamDeck.ts` and hotkeys.
