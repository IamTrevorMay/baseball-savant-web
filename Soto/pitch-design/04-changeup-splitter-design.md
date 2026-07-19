---
title: Changeup & Splitter Design — Kill-Spin, Movement, Seam Effects, and the Splitter Resurgence
domain: pitch-design
tags:
  - changeup
  - splitter
  - kick-change
  - seam-shifted-wake
  - velocity-separation
  - pronation-supination
  - platoon-splits
  - pitch-design
sources_reviewed: 22
last_updated: 2026-07-19
---

# Changeup & Splitter Design — Kill-Spin, Movement, Seam Effects, and the Splitter Resurgence

## TL;DR

- **There are two valid changeup archetypes, not one:** the *kill-spin* changeup (splitter-adjacent, ~1,500–1,700 rpm or lower, vertical separation off the fastball) and the *movement* changeup (high side-spin, arm-side run, spin direction tilted to 1:30–3:00 for a RHP). Driveline targets 8–12 mph off the fastball for both; the design choice should follow the athlete's pronation/supination bias, not a template. (proven)
- **Velocity separation drives whiffs; movement separation drives ground balls.** Effective whiff-oriented changeups typically show an 8–10+ mph gap; smaller gaps (far more common) produce elevated GB rates instead. League-average CH gap is ~8.4 mph. Power pitchers with big fastballs *and* big gaps get both. (proven)
- **Seam-shifted wake is real and measurable:** Hawk-Eye's observed-vs-spin-inferred axis "deviation" quantifies it. League-wide, non-Magnus effects add ~3–4 in of run+drop to sinkers and "considerable additional drop" to changeups/splitters — but ~42% of 2020 MLB pitches actually graded *worse* after accounting for seam effects, so SSW is a tool, not a universal upgrade. (proven)
- **The kick change (Tread Athletics/Leif Strom, 2023) is the biggest changeup innovation of the 2020s:** a circle-change grip with a spiked middle finger that tips the axis forward, giving supinators a hard (88–90 mph) changeup with splitter-like depth (~-10 in VB for Clay Holmes). Early adopters posted absurd numbers — Megill 50% whiff on 41 kick changes, Birdsong 46.7% whiff, Holmes 38.2% whiff and .182 BA against. (promising)
- **The splitter is back and the injury taboo is largely debunked:** usage climbed from ~2% (2015) to 3.2% (2024) to 3.3% (2025) — a pitch-tracking-era high — and spiked to 6.6% in the 2025 postseason (2x any prior October in 23 years). No controlled research has ever tied splitters to elevated UCL injury risk; the 1980s ban era (Angels, Twins, Giants, Reds, Padres, Rays all discouraged or banned it) ran on anecdote. (debunked — the injury claim, not the pitch)
- **Changeups are biomechanically the cheapest pitch in the arsenal:** elbow varus torque is 8–9% lower than fastball/slider during arm cocking, and elbow/shoulder proximal forces 10–14% lower during deceleration (Escamilla & Fleisig, pro pitchers); in youth pitchers the changeup produced the *lowest* elbow varus torque of FB/CB/CH. (proven)
- **Changeups show flat-to-reverse platoon splits** — the classic reason they're the offspeed weapon vs opposite-hand bats (RHP CH: .713 OPS vs LHB / .694 vs RHB, vs sinkers' .767/.693). Marchi's work: "straight" changes show a reverse platoon effect; hard "power" changes with fastball-like lateral movement are platoon-neutral. Yet ~79% of MLB changeups still go to opposite-hand hitters — same-hand usage is a live inefficiency. (promising)
- **Benchmark splitter plate-discipline profile (2024 SP league averages):** 38.9% Zone, 51.5% Swing, 15.3% SwStr, 27.7% Chase — a pitch that draws fastball-level swings with breaking-ball-level whiffs. League OPS against splitters (.517 in 2023) beat sliders (.651), sweepers (.635), and curves (.647). (proven)

## 1. The Two Changeup Archetypes: Kill-Spin vs Movement

Modern pitch design treats "changeup" as a family of solutions to one problem — creating separation off the fastball while looking like the fastball out of the hand — with two distinct physical strategies.

**The movement (side-spin) changeup.** The pitcher keeps spin rate relatively high but rotates the spin direction away from backspin toward sidespin. Driveline's target for a RHP is a spin direction of 1:30–2:30, drifting toward 3:00+ as sidespin increases; the ideal limit case is "dead sideways" spin — zero backspin, zero Magnus lift, maximum arm-side run (proven, well-characterized physics). Cues: "roll over the ball," "swipe the inside of the ball," "throw it with your ring finger," "pronate sooner." Driveline's most common grip (their "CH 2," used by ~35% of their athlete database) is a two-seam orientation with middle/ring fingers on the seams and the index finger slid to the side of the ball. The archetype's extreme is Devin Williams' Airbender: 84.2 mph (12.2 mph off his 96.4 fastball), 2,827 rpm — 100th percentile, ~400 rpm *above* typical changeups — 82.5% active spin producing 40.2 in of vertical drop and 18.1 in of run (both 97th percentile), a 58.9% whiff rate (best among 50+-pitch changeups, ~10 points clear of second), and a 63.6% GB rate on contact. Williams proves high spin is not a changeup defect if the *axis* is right — his side spin buys both planes of movement at once (proven, single-pitcher exemplar).

**The kill-spin changeup.** Instead of redirecting spin, remove it. Most changeups carry 500–800 fewer true rpm than the same pitcher's fastball; a practical kill-spin starting target is ~1,500–1,700 rpm, and splitter-family grips go far lower (Sasaki's forkball: 578 rpm in 2024, 492 the prior year; Senga's ghost fork: 1,193 rpm). Less backspin means less Magnus lift, so the pitch falls closer to a gravity-only trajectory — vertical separation off the fastball rather than horizontal. This archetype naturally blends into the splitter (Section 3) and is the correct home for athletes who can't or shouldn't chase heavy pronation.

**Design decision rule (practitioner consensus, promising):** choose the archetype by (a) fastball shape — Ethan Moore's Statcast study of five seasons found the best changeup outcomes (whiffs *and* low wOBA) came from a *straight, low-spin fastball paired with a running, high-spin changeup*, while running fastballs paired poorly with everything; and (b) the athlete's forearm bias (Section 5). A ride-heavy four-seam pitcher usually wants depth separation (kill-spin/kick/splitter); a sinker pitcher already living arm-side usually wants the velocity gap and depth more than extra run.

**For Soto:** Triton's Stuff+ (velo/movement/extension Z-scores per pitch_name) implicitly rewards both archetypes since `pitch_baselines` are per-pitch-type — a kill-spin CH scores on movement Z vs *changeup* baselines, not fastball baselines. But Stuff+ currently has no fastball-relative term. A cheap, high-value upgrade: add a `velo_sep` and `ivb_sep` feature (CH minus same-game FB averages) — the literature says separation, not raw shape, is the changeup's active ingredient. Both are computable from the existing `pitches` table with a window over pitcher-game.

## 2. Seam-Shifted Wake Changeups, the Discoball, and the Kick Change

**The physics.** Barton Smith's Utah State group (term coined 2019 by student Andrew Smith; public research from 2020) showed that seam position can trip the boundary layer and shift the wake behind the ball, generating force independent of Magnus. Statcast's 2020 move to Hawk-Eye made this measurable at scale: the camera *observes* the spin axis at release, and the gap between observed axis and the axis *inferred* from movement ("deviation") is the SSW signature (proven). Most SSW work concentrates on arm-side pitches — sinkers and changeups — where seam effects add run and, critically for changeups, drop.

**Magnitudes.** Driveline's 2021 analysis of 2020 Hawk-Eye data: sinkers gain ~3+ in of horizontal run and ~4 in of drop from non-Magnus effects league-wide; changeups/splitters gain "considerable additional drop"; cutters gain ~3 in glove-side and ~2 in of drop. Smith measured roughly 5 in of extra break on pure "looper" orientations. The crucial caveat: ~42% of pitches in the 2020 sample graded *lower* on Stuff after accounting for seam effects — SSW can also *fight* your Magnus movement. Deviation is a diagnostic, not a merit badge (proven, with the caveat equally proven).

**The discoball changeup** (Smith/Michael Augustine's term): tilt the axis so Magnus is fully sideways (arm-side run, no lift), then orient a long seam to sit near the top of the ball through flight so SSW supplies the *downward* force Magnus no longer provides. It generally wants spin *inefficiency* — Smith cites 21°+ of gyro on successful versions — which inverts fastball-design instincts. Practitioners: Strasburg, Kyle Hendricks, historically Wakefield. Smith's 2020 prediction that it would spread — because it's learnable and failed reps produce non-competitive misses rather than center-cut hangers — aged well (promising). Adoption is visible in Statcast: pitchers with >1 hour of observed-vs-inferred axis gap on changeups grew from 8 (2021) to 12 (2022), and Matthew Boyd's version is thrown "just like a slider" — seam orientation doing the work instead of wrist pronation.

**The kick change** is the commercialized version of this idea. Origin: Leif Strom at Tread Athletics, identified/named 2023, deliberately hunting a lefty-neutralizer for supinators. Grip: circle-change base, **middle finger spiked** off the ball; at release the spiked finger "kicks" the axis forward (adding forward tilt/gyro), and the ring finger cutting down the seam kills efficiency — producing changeup disguise with splitter depth at unusually high velocity (typically 88–90 mph). Hayden Birdsong (Giants) was first to throw it in an MLB game (June 2024). Brian Bannister (Giants pitching director, then White Sox) taught it to fellow supinator Davis Martin in August 2024; by 2025 it was the league's fashionable pitch (ESPN, Lookout Landing, FanGraphs all covered it as "the pitch of 2025").

Early-adopter numbers (2025, small-to-medium samples — grade promising, not proven):
- **Clay Holmes** (Mets, converted reliever): 16.2% usage, 88 mph with −10 in vertical break, 38.2% whiff, .182 BA against through 7 starts; his coach called his SP conversion impossible "without some form of the changeup."
- **Tylor Megill:** 41 kick changes (33 to LHB), 50% whiff, 1 hit allowed.
- **Hayden Birdsong:** 18.4% usage (2024) → 24.1% in relief (2025), 46.7% whiff, .188 BA against.
- Also adopted: Griffin Canning, Jack Leiter, Pablo López (alongside his traditional change).

Matt Blake's summary of why it spread in one offseason: every org has tracking on every pitch — "anyone that comes through and throws a certain pitch, you get a look at it. It just gets replicated."

**For Soto:** Statcast's `pfx` columns are *observed* movement, so Triton's data already contains SSW effects — what it lacks is the decomposition. Baseball Savant exposes spin-based vs observed axis; ingesting that deviation (or approximating from `spin_axis` vs movement-inferred axis) would let Triton flag SSW changeups automatically and would be a genuinely differentiated Compete/Neptune metric: TrackMan reports spin efficiency and gyro degree, so Neptune can measure a kid's kick-change candidacy (axis deviation + gyro + depth) on day one. For pitch-design sessions, an Edgertronic-class high-speed camera is the one tool this section argues for — seam orientation is invisible to radar.

## 3. The Splitter: Mechanics, the Taboo Years, and the Resurgence

**Mechanics.** Split the index and middle fingers around the ball (three grip tiers, in escalating demand: the "fosh"/split-change; the standard splitter with thumb underneath; the full forkball, deepest choke, large hands required, near-knuckleball spin). The split grip mechanically prevents the fingers from staying behind the ball, killing backspin without asking for any exotic wrist action — the pitcher throws a fastball and the grip does the pronation's job. That's exactly why Driveline's Chris Langin frames it as the *supinator's changeup*: it delivers changeup function "without extreme wrist movement" (promising, practitioner consensus). Typical MLB splitters sit ~7–10 mph off the fastball with spin in the ~1,000–1,500 rpm band (Wheeler 85.4 mph; Senga's fork 1,193 rpm; Sasaki's 945 rpm on the 2026 splitter variant and 492–578 rpm on the true forkball, with movement ranging from 15 in arm-side to 7 in *glove-side* — low-spin pitches are SSW-dominated and can move both ways).

**The taboo.** The splitter was "the pitch of the '80s" — Bruce Sutter (taught by Fred Martin post-surgery, rode it to the Hall), Roger Craig's Tigers and Giants staffs, Dave Stewart. When Craig's splitter-heavy Giants staff broke down, the pitch took the blame for the era's elbow epidemic. The belief calcified into policy: the Angels, Twins, Giants, Reds, Padres, and Rays were among many orgs that discouraged or outright banned splitter development, citing arm health plus a folk belief that it saps fastball velocity. Joe Maddon, 2011: the grip has "no resistance against the ball" and "puts a lot of pressure on the elbow."

**The evidence.** No controlled study has ever demonstrated elevated UCL injury risk from splitters. Doug Thorburn (2008): "I haven't come across any research that found a convincing link between a split-finger fastball and a specific arm injury... unproven conventional wisdom." Modern reporting (Yahoo/Passan-era piece, 2023) reached the same verdict: the grip loads the forearm flexor mass *differently* than other pitches, not demonstrably *more* dangerously — and flexor engagement arguably shares load with the UCL rather than adding to it. Grade: the specific claim "splitters cause TJ" is (debunked) at the level of available evidence; "splitters are perfectly safe" is (plausible) but unproven in the other direction — nobody has run the prospective study. Anecdotal residue (finger numbness from deep grips, hyperextension complaints) persists in older clinical commentary (plausible, uncontrolled).

**The resurgence.** Usage: ~2% of MLB pitches in 2015 → 2.1% in 2023 (then an all-time tracked high) → 3.2% among starters in 2024 (14-year high) → 3.3% in 2025, the highest of the pitch-tracking era (2008+). The 2025 postseason was the tell: 6.6% splitter rate — double any regular or postseason in 23 years — driven by the Blue Jays (9.3% regular season → 16% in October) and Dodgers (7.1%), vs 3.1% for non-playoff teams. Playoff splitters allowed a combined .170 wOBA with negative run value. League-wide 2023 slash vs splitters: .191/.232/.285 (.517 OPS), better than sliders (.651), sweepers (.635), and curveballs (.647). 2024 SP plate-discipline averages: 38.9% Zone, 51.5% Swing (fastball-like), 15.3% SwStr, 23.6% CSW, 27.7% Chase. Drivers: the NPB import proof-of-concept (Senga's ghost fork 52.3% whiff in his final NPB season; Sasaki 51.5% in 2023; Yamamoto), Gausman (38%+ usage, tops among SPs), Eovaldi, Bautista, Joe Ryan (natural supinator, added it at 25%+ usage, .179 BA against), Logan Gilbert, and Skenes' **splinker** — a 94.7 mph sinker-splitter hybrid (1,795 rpm, ~31.4 in vertical drop, 13.8–14.9 in run, 29.3% whiff, 87.4 mph EV against as a rookie) that showed the concept scales to triple-digit arms. Orioles GM Mike Elias has said publicly the org has zero hesitation developing splitters, explicitly citing platoon neutrality.

**For Soto:** the splitter taboo is a textbook case of the bro-science pattern Trevor discounts — decades of policy built on one team's injury cluster. For Neptune, the actionable rule is developmental, not prohibitive: split-grip pitches are reasonable for post-growth athletes with adequate hand size (start on the fosh/split-change tier), and there is no evidentiary basis for banning them — but also no prospective safety data, so track workload like any new pitch. In Triton, splitter identification is messy in Statcast (`FS` vs `FO` vs mislabeled changeups); Sasaki alone has two distinct offspeed variants. Consider clustering offspeed pitches by (velo, spin, movement) within pitcher rather than trusting `pitch_type` labels for arsenal analysis.

## 4. Velocity Separation: What the Research Actually Says

The folk target — "8–10 mph off the fastball" — is directionally right but hides a real tradeoff structure:

- **Whiffs scale with the gap.** Harry Pavlidis's Baseball Prospectus series (2012–2013, PITCHf/x era) found changeup whiffs are "largely a function of getting hitters out in front," i.e., maximizing FB–CH velocity separation; pitchers with large gaps generated significantly more whiffs (proven, replicated across eras).
- **Small gaps produce ground balls.** The same research found smaller separations — far more common league-wide — yield elevated GB rates rather than whiffs. A firm changeup is not a failed changeup; it's a different weapon (proven).
- **Power pitchers get both.** Big fastball + big gap = whiffs *and* grounders — the Pedro Martínez profile (Pedro's canonical gap was in the 10–15 mph range) (proven, historical).
- **Movement separation is a substitute good.** BP's conclusion: a changeup should differ from the fastball in velocity, spin axis, adjusted spin rate, *or several at once* — pitchers with modest velo gaps can survive on movement/axis separation, which mostly buys contact management rather than whiffs (promising).
- **League anchors:** average MLB changeup ~83.2 mph vs ~91.6 fastball → 8.4 mph gap (2013 data; the modern gap is similar with both velos shifted up). Splitters typically run a slightly smaller gap but more depth. The kick change deliberately runs a *small* gap (88–90 off mid-90s) and pays for it with splitter depth — evidence that in the 2020s, depth separation is being priced as high as velocity separation (promising).
- **Too much separation is real but rare:** below ~75–78 mph off a mid-90s fastball, the pitch leaves the fastball tunnel early enough for hitters to spit on it; practitioner guidance caps the useful gap around 12–14 mph unless the shape is elite (plausible, practitioner consensus rather than published research).

**For Soto:** this is the strongest argument in the whole document for arsenal-relative features in Triton. A 91 mph changeup is elite behind a 100 mph fastball and batting practice behind a 92 mph fastball; no per-pitch-type Z-score sees that. Recommended: `chg_velo_sep`, `chg_ivb_sep`, `chg_hb_sep` as derived columns, and a Neptune bullpen-report card that plots each athlete's CH/FS against their own fastball rather than against league baselines. Also a natural Compete/TrackMan drill metric: rolling velo-gap consistency across a pitch-design session.

## 5. Pronation, Supination, and Matching the Pitch to the Thrower

The organizing idea of 2020s offspeed design: **classify the athlete's forearm bias first, then pick the changeup technology.**

- **Pronators** (forearm rolls palm-down naturally through release) find traditional changeups easy and gyro sliders hard. Tread's "pronator triangle" arsenal: fastball + gyro slider + changeup, with the changeup as the natural strength. MLB exemplars: Devin Williams, Ryan Pepiot, José Ureña, and BP's "pronator's triangle" treatment of Luis Castillo (promising, practitioner framework — no peer-reviewed validation of the classification itself).
- **Supinators** (bias toward palm-up/cut) flash great breaking balls and dead-zone changeups. Their changeup menu, in ascending order of grip intervention: seam-shifted/discoball change (Boyd: wrist moves "like the other pitches"), kick change (spiked middle finger does the axis work), splitter (the grip does everything). This is precisely why the kick change and splitter boomed simultaneously — they're two solutions to the same supinator problem (promising).
- **Cue library for pronation-based changeups** (Driveline): "roll over the ball," "swipe the inside," "throw with the ring finger," "pronate sooner," "flexible wrist." Modern practice increasingly prefers grip/seam solutions over aggressive pronation cueing, because cue-driven wrist manipulation degrades under fatigue and costs command — the "feel pitch" fragility that helped changeup usage decline in the slider era (plausible, practitioner consensus).
- **Arm-speed dogma check:** "sell it with arm speed" survives scrutiny — the pitch's deception is delivery-invariance — but the *mechanism* is grip pressure and grip depth, not consciously slowing the arm. Cueing intent ("throw it like the fastball") outperforms cueing deceleration (promising, coaching consensus; direct EMG/biomech evidence thin).
- A useful 2025 wrinkle from FanGraphs: pronators throwing the kick change get a *different* (more run, less pure depth) shape than supinators — the grip interacts with the bias rather than overriding it. Pitch technologies are bias-conditional, not universal (promising).

**For Soto:** Neptune's intake battery should include a forearm-bias screen — cheap versions: observed spin efficiency/axis on max-intent fastballs and breaking balls via TrackMan, plus a plyo-ball "turn it over" screen — and route changeup development accordingly: pronators → traditional/Vulcan; supinators → kick change or split-change first. This one routing decision is most of the difference between a 6-week changeup build and a 2-year one. It's also content-friendly: "which changeup are you?" is a natural Mayday video franchise. For Trevor personally: he was a pronation-comfortable four-seam/changeup pitcher; the kick change is the modern experiment worth filming, and the biomech data (Section 6) makes changeup-family pitches the right tissue-cheap offering for a post-TJ, staying-sharp throwing program.

## 6. Why Changeups Play vs Opposite- (and Same-) Hand Hitters

**The geometry.** A changeup released on the fastball's initial trajectory and aimed middle finishes down-and-away to the opposite-hand hitter and down-and-in to the same-hand hitter; down-and-away is simply the better cell. That's the classical reason the changeup is *the* anti-opposite-hand weapon (proven, geometric).

**The numbers.** FanGraphs (2013 league data, RHP): changeups allowed .713 OPS vs LHB and .694 vs RHB — a ~19-point split versus the sinker's 74-point split (.767/.693) despite nearly identical arm-side movement. The difference is the 8.4 mph velocity gap: timing disruption is handedness-agnostic, while movement-based deception is handedness-dependent. Max Marchi's pitch-type platoon research (BP) refined it: the *straight* changeup shows a genuinely **reverse** platoon split (better vs opposite-hand), while the *power* change — harder, fastball-like lateral movement — is **platoon-neutral** (promising, one analyst's PITCHf/x-era work but consistent with everything since).

**The inefficiency.** Roughly 21% of MLB changeups (16,703 of 78,101 in the sampled span) are thrown same-hand — 4 of 5 go to opposite-hand hitters — even though the platoon evidence says good changeups hold up fine same-side. Counterexamples keep proving it: Tommy Kahnle throwing 70%+ changeups to everyone; Ohtani, Gausman, and Bautista riding split/change offspeed to neutral splits; Elias explicitly valuing splitter platoon-neutrality for roster construction. The residual objection — down-and-in to a same-hand hitter lands in the happy zone if it hangs — is a command constraint, not a prohibition (promising).

**Depth beats run for platoon neutrality.** The through-line of Sections 2–3: vertically-oriented offspeed (splitters, kick changes, discoballs) moves *down* rather than *toward* one batter's barrel, so it plays to both sides. This is exactly why the 2025 postseason splitter spike and the kick change's LHB-hunting design both happened — the league is converging on depth-first offspeed as the platoon-proof design (promising).

**For Soto:** Triton should surface CH/FS performance split by matchup handedness on the pitching dashboard (wOBA, whiff, usage share vs same/opposite) — the "does his changeup play same-side?" question is a scouting-report staple, and the 21% league baseline gives instant context. It's also a plus-metric candidate: changeup platoon-delta vs league. For Neptune athletes with big breaking balls but a platoon hole, this section *is* the development roadmap.

## 7. Arm Health: The Changeup Is the Cheapest Pitch You Can Throw

- **Pro pitchers (Escamilla & Fleisig et al., AJSM/PubMed):** elbow varus torque 8–9% greater in fastball and slider than changeup during arm cocking; elbow flexor torque 9–14% greater in fastball than curveball/changeup during deceleration; elbow and shoulder proximal forces 10–14% greater in fastball/slider/curveball than changeup. The changeup is the lowest-load pitch in the studied arsenal (proven).
- **Youth pitchers (Dun, Loftice, Fleisig, Kingsley, Andrews):** fastball highest elbow varus torque, curveball next, changeup lowest; curveball highest wrist-flexion and forearm-supination torque. The traditional "changeup first, breaking ball later" youth guidance has real kinetic backing (proven).
- **Splitter-specific load:** unmeasured. Marker-based mocap can't see grip-level finger loading, and no lab has published splitter kinetics; the honest statement is "different flexor demand, unknown net effect" (plausible either way — see Section 3).
- **Practical implication:** offspeed-heavy pitch mixes are a legitimate workload-management lever, not just a tactical one. A changeup thrown at 88% of fastball intent with 10% lower joint loading is the cheapest competitive pitch in the arsenal — relevant for return-to-throwing progressions and high-volume youth schedules (promising as programming doctrine; the torque numbers themselves are proven).

**For Soto:** for Neptune's arm-care layer, pitch-mix composition belongs in the workload model — a 60-pitch outing at 40% changeups is not the same tissue dose as 60 fastballs. If/when Neptune adds a biomech layer (IMU or markerless), per-pitch-type elbow torque estimates benchmarked against the Fleisig percentages above are the validation target. For Trevor: changeup/splitter-family experimentation is the lowest-risk pitch-design content he can film with his own arm.

## 8. Design Targets & Benchmarks (Quick Reference)

| Parameter | Movement CH | Kill-spin CH | Kick change | Splitter | Notes |
|---|---|---|---|---|---|
| Velo gap vs FB | 8–12 mph | 8–12 mph | 5–8 mph | 6–10 mph | Whiffs scale with gap; small gaps → GBs |
| Spin (rpm) | 1,700–2,800+ | ≤1,500–1,700 | mid, low-efficiency | ~900–1,500 (fork <600) | Williams 2,827; Senga 1,193; Sasaki fork 492–578 |
| Spin direction (RHP) | 1:30–3:00 | axis-agnostic | forward-tipped (gyro ↑) | near-topless tumble | Discoball wants 21°+ gyro |
| Primary separation | horizontal (run) | vertical (depth) | vertical (−VB) | vertical (depth) | Holmes kick: −10 in VB @ 88 |
| Thrower bias fit | pronator | either | supinator | supinator | Route by bias first (Sec. 5) |
| Platoon behavior | reverse (straight) / neutral (power) | neutral-ish | built to be neutral | neutral | Depth-first = platoon-proof |
| Elite whiff comp | Williams 58.9% | — | Megill 50%, Birdsong 46.7% | Sasaki 51.5%, Senga 52.3% (NPB) | 2024 SP splitter avg SwStr 15.3% |

League context anchors: CH ≈ 8.4 mph average gap; splitter usage 3.3% (2025, tracking-era high), 6.6% (2025 postseason); 2023 league OPS vs splitters .517; ~79% of changeups thrown opposite-hand.

## Sources

1. Driveline Baseball — How to Throw a Changeup (2020): https://www.drivelinebaseball.com/2020/06/how-to-throw-a-changeup/
2. Driveline Baseball — The Impact of Seam-Shifted Wakes on Pitch Quality (2021): https://www.drivelinebaseball.com/2021/03/the-impact-of-seam-shifted-wakes-on-pitch-quality/
3. Driveline Baseball — An Introduction to Seam-Shifted Wakes and their Effect on Sinkers (2020): https://www.drivelinebaseball.com/2020/11/more-than-what-it-seams-an-introduction-to-seam-shifted-wakes-and-their-effect-on-sinkers/
4. FanGraphs — The Month of the Splitter (2025): https://blogs.fangraphs.com/the-month-of-the-splitter/
5. RotoGraphs — Know Your Averages, Splitter Edition (2025): https://fantasy.fangraphs.com/know-your-averages-splitter-edition/
6. ESPN — How the kick change has kick-started the Mets' rotation (2025): https://www.espn.com/mlb/story/_/id/45007922/mlb-2025-kick-change-changeup-new-york-mets-holmes-canning-megill
7. Lookout Landing — What the "kick change" is and why it's going to be the pitch of 2025: https://www.lookoutlanding.com/2025/2/28/24367452/what-the-kick-change-is-pitch-of-2025-andres-munoz-brian-bannister-supination-pronation
8. FanGraphs — Davis Martin and Matt Bowman Break Down the Kick Change: https://blogs.fangraphs.com/davis-martin-and-matt-bowman-break-down-the-kick-change/
9. FanGraphs — What if a Pronator — Not a Supinator — Threw a Kick-Change?: https://blogs.fangraphs.com/what-if-a-pronator-not-a-supinator-threw-a-kick-change/
10. FanGraphs — Devin Williams and the Unicorn Changeup (2020): https://blogs.fangraphs.com/devin-williams-and-the-unicorn-changeup/
11. FanGraphs — Sinkers, Change-ups and Platoon Splits: https://blogs.fangraphs.com/sinkers-change-ups-and-platoon-splits/
12. Baseball Prospectus — Pitching Backward: A Refresher on Changeups (Marchi platoon findings): https://www.baseballprospectus.com/news/article/28276/pitching-backward-a-refresher-on-changeups/
13. Baseball Prospectus — What Makes a Good Changeup? Parts 1–3 (Pavlidis): https://www.baseballprospectus.com/news/article/20539/what-makes-a-good-changeup-an-investigation-part-1/
14. Ethan Moore — Change Piece: Finding the Ideal FB/CH Combination (Something Tangible, Medium): https://medium.com/something-tangible/change-piece-finding-the-ideal-fb-ch-combination-f22a3a3357df
15. Morning Brushback — Seam Shifted Wake, Discoball Changeups & Baseball Aerodynamics with Barton Smith: https://morningbrushback.com/seam-shifted-wake-discoball-changeup-barton-smith/
16. Yahoo Sports — Why the splitter could flip from baseball taboo to popular experiment (2023): https://sports.yahoo.com/why-the-splitter-could-flip-from-baseball-taboo-to-popular-experiment-for-mlb-pitchers-233752828.html
17. The Advance Scout (Noah Woodward) — Return of the Changeup: https://theadvancescout.substack.com/p/return-of-the-changeup
18. Escamilla, Fleisig et al. — Biomechanical Comparisons Among Fastball, Slider, Curveball, and Changeup Pitch Types (PubMed): https://pubmed.ncbi.nlm.nih.gov/28968139/
19. Fleisig et al. — Differences among fastball, curveball, and change-up pitching biomechanics across various levels of baseball (Sports Biomechanics): https://www.tandfonline.com/doi/abs/10.1080/14763141.2016.1159319
20. MLB.com — Does Roki Sasaki throw a forkball or a splitter?: https://www.mlb.com/news/roki-sasaki-s-forkball-and-splitter-explained
21. MLB.com — Paul Skenes' splinker fools hitters in MLB debut: https://www.mlb.com/news/paul-skenes-splinker-fools-hitters-in-mlb-debut
22. Viva El Birdos — Why Don't Pitchers Throw Same-Sided Changeups? (2024): https://www.vivaelbirdos.com/2024/7/7/24191452/why-dont-pitchers-throw-same-sided-changeups
