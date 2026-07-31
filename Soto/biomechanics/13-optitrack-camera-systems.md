---
title: OptiTrack Camera Systems for a Baseball Capture Volume (2026) — PrimeX 22 and the Lineup
domain: biomechanics
tags:
  - motion-capture
  - optitrack
  - primex-22
  - marker-based
  - markerless
  - capture-volume
  - facility-tech
  - biomechanics-lab
sources_reviewed: 14
last_updated: 2026-07-31
---

# OptiTrack Camera Systems for a Baseball Capture Volume (2026) — PrimeX 22 and the Lineup

## TL;DR

- **OptiTrack cameras are the *hardware* layer. They do not, by themselves, decide marker vs markerless.** The same PrimeX cameras feed **either Motive (marker-based) or Captury Live (markerless)** — that architectural fork is the real Neptune decision and it lives in [14-motive-captury-mocap-fork.md](14-motive-captury-mocap-fork.md), not here. This doc is the hardware spec sheet and the volume-design math. (context)
- **PrimeX 22 is the sweet-spot camera for a high-speed throwing/hitting lab.** 2048×1088 (2.2 MP) global-shutter sensor, **360 Hz native**, **2.8 ms** camera latency, **±0.2 mm** 3D accuracy, 79°×49° FOV on the stock 6.8 mm f/1.6 lens, 20-LED 850 nm IR ring, active-marker range 30 m / passive 21 m, GigE data + PoE+ power, 1.26 kg. Its image-stopping global shutter is explicitly rated for capturing movement "above 150 mph." (manufacturer spec)
- **Frame rate, not resolution, is why 22 beats its neighbors for pitching.** Shoulder internal-rotation velocity (~7,000–9,500°/s) is the fastest measured human joint motion; you want temporal density on it. PrimeX **13 = 240 Hz**, **22 = 360 Hz**, **41 = only 180 Hz native** (its win is 4.2 MP resolution + 148 ft range for *large* volumes, not speed), **120 = 300 Hz / 12 MP** flagship for huge studios. For a dedicated single-athlete pitching bay, **22 > 13 > 41** on fitness-for-purpose; 13 is the budget-adequate pick (Driveline's lab runs 10× Prime 13/13W at 240 Hz). (manufacturer spec + Driveline reference)
- **A pitching capture volume is small and dense, not a mound-to-plate tunnel.** You are capturing the *pitcher's body* from leg-lift through follow-through — roughly a **4 m × 4 m × 2.5 m** box (~40 m³) ringed by cameras 3–6 m out at staggered heights, angled to keep the throwing arm visible at layback and release (the fastest, most occlusion-prone instant). Ball flight and plate work are TrackMan/Hawk-Eye's job, not the mocap ring's. (synthesis)
- **Camera count is driven by occlusion, not range.** OptiTrack range vastly exceeds a 40 m³ bay; the binding constraint is that every marker must be seen by **≥2 cameras (ideally 3+) at every frame** through a rotating, self-occluding delivery. Marker-based pitching needs **8–12 cameras**; markerless (Captury) tolerates fewer (4–8) but improves with more. Reference rigs: ASMI **12 cameras @ 240 Hz / 39 markers**; Driveline **10 × Prime 13 @ 240 Hz + 3 force plates**. (proven — established lab practice)
- **Pricing is quote-gated.** OptiTrack lists no public camera prices; expect a **10–12-camera PrimeX lab in the ~$50k–150k+ hardware range** depending on model (this is an order-of-magnitude estimate, not a spec-sheet number). Software is separate: **Motive:Body ≈ €5,499 (~$6k) per seat** (see doc 14). (estimate / one confirmed software list price)

## 1. Where OptiTrack Sits in the Stack

OptiTrack (brand of NaturalPoint) is an **optical motion-capture hardware and software company**. It makes two things that matter to Neptune: (1) a family of synchronized high-speed cameras (the Prime/PrimeX, SlimX, Prime Color, and Flex lines), and (2) **Motive**, the capture software that turns camera images into 3D marker/skeleton data. It is the same vendor Driveline's marker-based research lab is built on, and it is one of the two dominant Western optical-mocap ecosystems alongside Vicon and Qualisys (all three appear in the pitching-biomechanics literature already in [07-motion-capture-technology.md](07-motion-capture-technology.md)).

The load-bearing point for a facility buyer: **the cameras are agnostic to the biomechanics method.** OptiTrack markets Prime cameras for marker-based capture, but the same PrimeX hardware also runs **Captury Live markerless** software (via an officially documented integration — see doc 14). So the camera purchase and the marker-vs-markerless philosophy are *separable* decisions. You can buy the ring first and choose — or run both on — Motive and Captury after. That flexibility is the strategic reason to take OptiTrack hardware seriously even if the eventual answer is markerless.

**For Soto:** In the brain's existing buyer's-guide framing (doc 07), OptiTrack is the concrete instantiation of "marker-based optical mocap: the gold standard." What doc 07 didn't say — and what changes the calculus — is that this exact hardware is *also* a markerless platform. That collapses the old "buy a marker lab OR buy markerless" fork into "buy OptiTrack cameras, then pick your software path (or hybrid)." Doc 14 works that through.

## 2. PrimeX 22 — Full Spec Sheet

The PrimeX 22 is OptiTrack's mid-high Prime camera and the single best fit for a high-velocity sports-biomech volume. Everything below is manufacturer spec (optitrack.com), which is a marketing surface — treat range/accuracy as best-case lab numbers, not field-guaranteed.

| Spec | PrimeX 22 |
|---|---|
| Sensor resolution | 2048 × 1088 (**2.2 MP**) |
| Native frame rate | **360 Hz** (fps) |
| Latency | **2.8 ms** |
| 3D accuracy | **± 0.2 mm** (positional) |
| Field of view (stock lens) | **79° H × 49° V** |
| Stock lens | C-Mount **6.8 mm f/1.6**, wide-band anti-reflective coating |
| Shutter | Global (image-stopping); default 0.25 ms, range **0.01–2.5 ms** |
| High-speed rating | Usable for movement **> 150 mph** (image-stopping shutter) |
| IR illumination ring | **20 × LED, 850 nm IR** |
| Camera-to-marker range | **Active 30 m (98 ft) / Passive 21 m (69 ft)** |
| Data / power port | **GigE** data, **PoE+** power (single cable) |
| Onboard | Integrated image processing (2D centroiding on-camera); aim assist; definable-color status-indicator LED rings |
| Dimensions | 12.6 × 12.6 × 10.64 cm |
| Weight | **1.26 kg (2.77 lb)** |
| IP rating | Not published for the 22 (the 41 ships an IP66-rated lens; assume the 22 body is *indoor lab*, not weatherized) |

**What the numbers mean in practice:**

- **360 Hz is the headline.** At 360 Hz you sample the delivery every ~2.8 ms. Given peak shoulder IR velocity of ~7,500°/s, that is ~21° of arm rotation between frames at the fastest instant — tight enough to resolve peak-velocity timing, which discrete-scalar peaks and, critically, the *derivatives* used for torque depend on. A 240 Hz camera (PrimeX 13) samples every ~4.2 ms (~31° between frames at peak) — usable, which is why ASMI and Driveline capture at 240 Hz, but the 22 buys margin exactly where pitching is hardest.
- **On-camera image processing** means each camera computes marker centroids locally and streams *coordinates*, not raw video, over GigE — this is what keeps a 12-camera 360 Hz system inside a few-ms latency budget and off a saturated network.
- **The "150 mph" shutter claim** is about freezing a fast-moving marker without blur, i.e. bat-end and ball-adjacent markers — relevant to hitting capture, less so to the (slower-translating but fast-*rotating*) pitching arm.
- **± 0.2 mm accuracy** is the marker-reconstruction figure under good calibration; it is *not* the joint-angle or torque accuracy your athlete report inherits — soft-tissue artifact and model choice dominate downstream error (see doc 07 §2).

## 3. The Lineup — PrimeX 22 vs Everything Else

OptiTrack's current families: **PrimeX** (13, 13W, 22, 41, 41W, 120, 120W, plus a 260), **SlimX** (slim-body versions of the same sensors — same optics, low-profile housing for tight installs), **Prime Color** (reference color video, not a tracking camera — for synced coach's-eye footage), and **Flex** (3, 13 — USB, entry/education tier). Duo 3 / Trio 3 are pre-calibrated tracking *bars*. The tracking members that matter for a pitching bay:

| Model | Res / MP | Native FPS | Latency | FOV (stock) | Active / Passive range | 3D acc. | Best for |
|---|---|---|---|---|---|---|---|
| **PrimeX 13** | 1280×1024 / 1.3 MP | 240 Hz | 4.2 ms | (S-mount 5.5 mm) | 25 m / 16 m | ±0.3 mm | Budget Prime; compact volumes, high camera counts. Driveline's lab camera. |
| **PrimeX 13W** | 1280×1024 / 1.3 MP | 240 Hz | 4.2 ms | wide | 15 m / 9 m | ±0.3 mm | Wide FOV, close range — cameras tight to a small volume. |
| **PrimeX 22** | 2048×1088 / 2.2 MP | **360 Hz** | **2.8 ms** | 79°×49° | 30 m / 21 m | ±0.2 mm | **High-speed single-athlete sports biomech (the pick).** |
| **PrimeX 41** | 2048×2048 / 4.2 MP | **180 Hz** | 5.5 ms | 51°×51° | 45 m / 30 m | **±0.1 mm** | Large / multi-athlete volumes; max precision at range — but slow. |
| **PrimeX 41W** | 2048×2048 / 4.2 MP | 180 Hz | 5.5 ms | 65°×65° | 30 m / 21 m | ±0.3 mm | Large volume, fewer cameras (wide FOV). |
| **PrimeX 120** | 4096×3072 / 12 MP | 300 Hz (→1000 Hz reduced) | n/p | 51°×39° | longest | ±0.1 mm | Huge studios, virtual production, robotics — overkill for a bay. |

### When to pick the 22 over the 13 or 41

- **22 over 13:** you want the extra 120 Hz (360 vs 240) and 2.2 vs 1.3 MP for a *high-velocity* capture where arm/bat speed and torque derivatives are the whole point. More pixels-on-marker also lets you place cameras farther back or track smaller markers, and the 2.8 ms latency (vs 4.2 ms) matters if you ever drive real-time biofeedback. Cost is the trade — 13 is the cheaper camera and 240 Hz is *adequate* (it's what ASMI/Driveline use).
- **22 over 41:** counterintuitive but important — the **41 is only 180 Hz native**, half the 22's temporal resolution. The 41's advantages (4.2 MP, ±0.1 mm, 148 ft range, up to ~290,000 cu ft/camera passive) are about *big volumes and multi-person* capture, not high-speed single-athlete throwing. **For a pitching/hitting bay you specifically do not want to trade frame rate for range you'll never use.** Pick the 41 only if the same room must also do large-group or full-field-adjacent capture.
- **22 over 120:** you'd only reach for a 120 if you were building a cinematic-scale or multi-cage volume; for one mound it's wrong-sized and wrong-priced.

**Bottom line ranking for a dedicated pitching/hitting volume:** PrimeX 22 (best) → PrimeX 13/13W (budget-adequate) → PrimeX 41 (only for large/multi-athlete rooms). SlimX 22 is the same sensor in a low-profile body if wall/truss clearance is tight.

## 4. Designing the Capture Volume (Hz, Count, Placement, Size)

This is the part facilities get wrong by over-thinking "mound to plate." **Biomech mocap captures the body, not the ball's 60'6" journey.** The pitch's ball flight is TrackMan/Hawk-Eye's job (already in Compete). The mocap ring only needs to see the pitcher from first movement through follow-through.

**Volume size.** A pitcher's delivery — leg lift, stride down the mound, release, deceleration — sweeps roughly a **4 m long × 3–4 m wide × 2.5 m tall** box, call it **~35–45 m³**. A hitting volume is smaller in translation (a batter stays largely in place) but demands equal density around the fast rotating segments and the bat. Both are *small, dense* volumes.

**Frame rate.** **240 Hz is the practical floor for pitching; 300–360 Hz is preferable.** OpenBiomechanics captures markers at 360 Hz (force plates at 1080 Hz); ASMI/Driveline at 240 Hz; KinaTrax in-stadium at 300 Hz. The 22's 360 Hz sits at the high end without going to specialty 500–1000 Hz (which the 41/120 can do only at reduced resolution). Higher Hz specifically protects the *velocity and torque* estimates that live in the derivatives of position.

**Camera count.** Marker-based capture requires every marker be seen by **≥2 cameras every frame** (3+ for robust reconstruction). A pitching delivery is a rotation with heavy self-occlusion (the throwing arm hides behind the trunk at layback), so you over-provision angles:
- **Marker-based pitching bay: 8–12 cameras.** ASMI uses 12; Driveline uses 10 (Prime 13/13W). Eight is a workable floor for one athlete; 10–12 gives redundancy against occlusion and lets you keep markers on both arms/legs tracked through release.
- **Markerless (Captury) on the same ring: 4–8 cameras** can work, with accuracy improving as you add cameras; OptiTrack's own Captury integration testing used **8× PrimeX 22** and **12× PrimeX 41** rigs (see doc 14).

**Placement.** Ring the volume with cameras **3–6 m out**, at **staggered heights** (some low, some at ~2.5–3 m), each aimed at the center of the delivery. Prioritize coverage of the **throwing-arm layback-to-release arc** — put extra cameras on the open (glove) side and behind/above to see the arm at maximum external rotation, the fastest and most occluded instant and the one that drives the torque number. Avoid pointing cameras directly at each other (IR ring wash-out) and keep the mound out of any camera's near-blind zone.

**Marker set.** Marker-based baseball uses ~**39–47 reflective markers** (ASMI 39; OpenBiomechanics 23+ core plus clusters) glued to bony landmarks bilaterally. Marker placement is ~30 min/athlete of skilled labor — the reason facilities drift markerless for roster-scale throughput (doc 07 §7).

**For Soto:** For a Neptune pitching bay, spec **8–12 PrimeX 22 at 360 Hz** ringing a ~4×4×2.5 m volume with 2–3 in-ground or portable force plates under the mound landing zone (force plates are what unlock kinetics — §2 of doc 14). That is the marker-*capable* rig; whether you run markers or Captury on it is the doc-14 decision. If budget forces it, 10× PrimeX 13 at 240 Hz replicates the Driveline lab and is defensible.

## 5. Pricing Reality

OptiTrack publishes **no public camera pricing** — every camera and Motive-license page routes to "Contact Sales," and both are handled through quote/reseller channels (in the US, Studio B&H). What is findable:

- **Motive:Body 3.x software license: €5,499 ex-VAT (~$6,000)** per seat (EU reseller list price); Body Unlimited and the Edit/Tracker tiers price separately (doc 14 §2.6).
- **Cameras: quote-only.** Order-of-magnitude, a PrimeX ring of 10–12 cameras plus Motive, calibration wand, sync, and mounting typically lands in the **~$50k–150k+** band depending on model (13 at the low end, 41/120 far higher). Treat this as an estimate to size a budget, not a spec-sheet fact — get a real quote before it touches a plan.

Context from the brain: this is *below* a KinaTrax in-stadium install (~$500k + $75k/yr, doc 07 §3) and *above* a phone/tablet markerless pipeline (Uplift/ProPlayAI, near-free to low-thousands). OptiTrack + markerless-software (Captury) is the "research-adjacent fidelity without stadium cost" middle rung.

## 6. For Soto / Neptune

1. **The camera buy and the marker/markerless philosophy are separable.** Buying OptiTrack PrimeX does not commit Neptune to gluing markers on 14-year-olds — the same ring runs Captury markerless. This is the single most important reframing vs doc 07's older "marker lab vs markerless" binary.
2. **If Neptune builds an optical ring, spec PrimeX 22 @ 360 Hz, 8–12 cameras, ~4×4×2.5 m volume, force plates under the landing zone.** 22 over 13 for the frame rate; 22 over 41 because 41 trades frame rate for range you don't need. 10× PrimeX 13 @ 240 Hz is the budget fallback (the Driveline template).
3. **Don't build a "mound-to-plate" volume.** Mocap sees the body; TrackMan/Compete already sees the ball. Keep them as separate data streams joined on a session key.
4. **Schema instinct holds and sharpens:** a `capture_system` provenance column must distinguish not just *marker vs markerless* but the **exact rig** (`optitrack_primex22_motive` vs `optitrack_primex22_captury` vs `kinatrax` vs `theia3d`), because coordinate frames, units, and joint-center definitions differ by *software*, not just camera (doc 14 §6). Camera model alone is insufficient provenance.

## Sources

1. OptiTrack — PrimeX 22 Specs. https://www.optitrack.com/cameras/primex-22/specs.html
2. OptiTrack — PrimeX 22 In Depth. https://www.optitrack.com/cameras/primex-22
3. OptiTrack — PrimeX 13 Specs. https://optitrack.com/cameras/primex-13/specs.html
4. OptiTrack — PrimeX 13 In Depth. https://www.optitrack.com/cameras/primex-13
5. OptiTrack — PrimeX 41 Specs. https://optitrack.com/cameras/primex-41/specs
6. OptiTrack — PrimeX 41 In Depth. https://optitrack.com/cameras/primex-41
7. OptiTrack — PrimeX 120 In Depth. https://www.optitrack.com/cameras/primex-120
8. OptiTrack — Compare Cameras. https://www.optitrack.com/cameras/compare
9. OptiTrack — Camera latency by frame rate (NatNet SDK Latency Measurements). https://docs.optitrack.com/developer-tools/natnet-sdk/latency-measurements
10. B&H Photo — OptiTrack PrimeX 22 (PX22) product page. https://www.bhphotovideo.com/c/product/1805496-REG/optitrack_px22_primex_22_camera.html
11. Freedspace/TrackLab — OptiTrack PrimeX 22 (2.8 ms latency, 360 fps, >150 mph shutter). https://freedspace.com.au/products/tracklab/optitrack-primex-22/
12. Driveline Baseball — The Research Lab (10× Prime 13/13W @ 240 Hz + force plates). https://www.drivelinebaseball.com/research-lab/
13. Qualisys — Baseball motion capture (frame-rate context, up to 1100 Hz). https://www.qualisys.com/analysis/baseball/
14. Cornershop-Immersion (EU reseller) — Motive:Body 3.x list price (€5,499). https://cornershop-immersion.com/en/software/226--licence-optitrack-motive-body-3x.html
</content>
</invoke>
