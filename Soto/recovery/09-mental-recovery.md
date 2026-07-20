---
title: Mental Recovery & Psychological Readiness for Pitchers
domain: recovery
tags:
  - mental-recovery
  - stress-recovery-balance
  - mental-fatigue
  - mindfulness-breathwork
  - pitcher-routines
  - youth-burnout
  - restq-sport
  - hrv-biofeedback
sources_reviewed: 17
last_updated: 2026-07-19
---

# Mental Recovery & Psychological Readiness for Pitchers

## TL;DR

- **Stress-recovery balance is measurable and monitorable.** The RESTQ-Sport captures 19 scales (7 general-stress, 5 general-recovery, 3 sport-specific-stress, 4 sport-specific-recovery), 77 items over the "past 3 days and nights," 0–6 Likert, with subscale Cronbach's α typically >0.85 (proven as a psychometric instrument). It differentiates overtrained from well-recovered athletes and is the closest thing to a validated "psychological workload" gauge.
- **Mental fatigue's performance hit is real but smaller than the hype.** A bias-sensitive meta-analysis of 30 studies (317 participants, avg 13.7/study) found an unadjusted effect on exercise performance of dz = –0.50, but after correcting for publication bias it shrank to dz = –0.08 (non-significant) (promising, not proven). Endurance is more affected than max strength or anaerobic power.
- **Sleep is the highest-leverage cognitive-recovery lever in baseball.** Five nights of sleep extension in pro baseball players improved cognitive processing speed 13% (122 ms faster reactions) and selective-attention speed by 66 ms (proven, small-sample); one night of short sleep can slow reaction time 10–30% (plausible).
- **Mindfulness training beats most mental-skills packages on paper — but studies are small and biased upward.** An 11-RCT meta-analysis (582 athletes) reported large SMDs: flow +1.47, performance +0.92, mindfulness +1.08, anxiety –0.87; strongest doses were 7–12 weeks, ~1 h/session (promising given wide CIs).
- **Breathwork is the fastest, cheapest arousal down-regulator.** A Stanford RCT (111 people, 5 min/day × 28 days) found cyclic sighing (double-inhale, long exhale) lowered respiratory rate and improved positive affect more than mindfulness meditation, +1.91 points on a mood scale (promising). Slow paced breathing at ~6 breaths/min (0.1 Hz) drives the baroreflex resonance that underlies HRV biofeedback.
- **A between-pitch reset routine is standard practice with a plausible mechanism.** Step off the rubber → exhale to "release" the pitch → single cue for the next one; it externalizes attention and blocks rumination (plausible; strong practitioner consensus, thin RCT base). Tread Athletics teaches this explicitly in Mental Skills 101 (routines, breathing, arousal regulation, visualization, alter ego).
- **Youth baseball burnout is a chronic-stress syndrome with three measurable dimensions** — physical/emotional exhaustion, reduced sense of accomplishment, sport devaluation (Raedeke & Smith ABQ, 15 items) — and it tracks with early single-sport specialization. Youth pitchers throwing with arm fatigue are ~13x more likely to suffer shoulder/elbow injury; 15–19 y/o Tommy John incidence rose ~9%/yr (proven for injury; burnout link plausible).
- **Interventions reduce youth burnout with moderate-to-large effects.** A 5-RCT meta-analysis (430 athletes, ages 11–23) found reductions across all three dimensions: exhaustion d = –0.87, devaluation d = –0.77, reduced accomplishment d = –0.74; CBT and mindfulness both worked, and online delivery matched or beat in-person (promising, thin evidence base).

## Why Mental Recovery Belongs in an Arm-Care System

Every serious throwing program tracks physical workload — pitch counts, acute:chronic ratios, velocity maintenance, mound frequency. Far fewer track the *psychological* load that runs on the same nervous system. That is a gap, because the autonomic nervous system does not distinguish "I threw a bullpen" from "I have three finals and a coach chewing me out." Both spend the same recovery budget.

The unifying model is **stress-recovery balance**: performance readiness is the net of accumulated stress (training + life + competition) minus accumulated recovery (sleep, downtime, positive affect, psychological detachment). When stress chronically outruns recovery you get overreaching, then overtraining/burnout — a state defined by underperformance despite continued or increased effort, mood disturbance, and (in athletes) sport devaluation. Mental recovery is not a soft add-on; it is one half of the equation that determines whether the physical training adapts or breaks the athlete (proven as a framework).

**For Soto:** Neptune's monitoring spine should treat psychological load as a first-class variable alongside TrackMan workload. A lightweight wellness/RESTQ-style check-in feeding the same athlete dashboard as pitch-count and Stuff+ data is the differentiator a "development lab" can offer that a commodity cage barn cannot.

## Stress-Recovery Balance & the RESTQ-Sport

The **Recovery-Stress Questionnaire for Sport (RESTQ-Sport)**, developed by Michael Kellmann and Klaus-Dietrich Kallus, is the field-standard self-report for stress-recovery state. It exists in 76/77-, 52-, and 36-item forms. The full RESTQ-Sport has **19 scales × 4 items + 1 warm-up item = 77 items**, each rated 0 (never) to 6 (always) for "the past 3 days and nights" (proven instrument design).

The 19 scales split into four families:
- **7 general-stress scales:** General Stress, Emotional Stress, Social Stress, Conflicts/Pressure, Fatigue, Lack of Energy, Physical Complaints.
- **5 general-recovery scales:** Success, Social Recovery, Physical Recovery, General Well-being, Sleep Quality.
- **3 sport-specific-stress scales:** Disturbed Breaks, Emotional Exhaustion (Burnout), Injury.
- **4 sport-specific-recovery scales:** Being in Shape, Personal Accomplishment, Self-Efficacy, Self-Regulation.

High scores on stress scales = high subjective stress; high scores on recovery scales = good recovery behavior. Subscale internal consistency is generally strong (Cronbach's α typically >0.85), construct validity is supported by its ability to separate overtrained from recovered athletes, and it is sensitive to training-load manipulations across a mesocycle (proven). Kellmann's broader work on preventing overtraining in high-intensity sport frames RESTQ as a monitoring tool that catches maladaptation *before* it shows up in performance decrements (promising).

Practical read on the instrument:
- The 3-day recall window makes it a **repeatable weekly/biweekly monitor**, not a one-off. The signal is the *trend* — rising general/emotional stress with falling sleep-quality and general-well-being recovery is the classic pre-overtraining pattern.
- The short 36-item version has been validated in elite swimmers before championships and is more realistic for repeated athlete use than the 77-item full form (promising).
- It is self-report, so it is subject to under-reporting by athletes who fear looking weak; pairing it with an objective marker (HRV, sleep tracking, velocity maintenance) hardens the signal.

**For Soto:** A digital RESTQ-36 (or an even shorter custom wellness subset — sleep quality, fatigue, emotional stress, being-in-shape) is a near-zero-cost addition to the Compete/Neptune athlete flow. Store it in the same Supabase spine as `compete_pitches`, chart the stress-vs-recovery trend on the athlete dashboard alongside workload, and flag athletes whose stress scales trend up while recovery scales trend down for two consecutive check-ins.

## Mental Fatigue & Performance: Real, but Oversold

"Mental fatigue" is a psychobiological state induced by prolonged demanding cognitive activity, marked by subjective tiredness and reduced motivation. The popular claim — that a mentally taxed athlete performs worse — is *partly* true and heavily inflated by publication bias.

The honest numbers, from a 2024 bias-sensitive meta-analysis (30 studies, 25 quantitatively analyzed, 317 participants, 16% female, avg 13.7 participants/study, range 8–31):
- **Unadjusted effect on exercise performance: dz = –0.50** (95% CI –0.76 to –0.25) — a small-to-medium hit.
- **Unadjusted effect on RPE (perceived exertion): dz = –0.21** (95% CI –0.47 to 0.04).
- **After 3-parameter selection-model bias correction: performance dz = –0.08** (95% CI –0.40 to 0.23, non-significant); RPE dz = –0.13 (non-significant).
- Heterogeneity was high (I² ≈ 75%) and Egger's test confirmed significant funnel asymmetry, meaning the raw average "is likely to overestimate the true effects."

The conclusion: current evidence does **not** conclusively support that mental fatigue harms exercise performance (debunked as a large/certain effect; promising as a small real effect). Van Cutsem's earlier reviews found endurance performance impaired but **maximal strength and anaerobic work unaffected** — relevant to pitching, which is a maximal-effort, short-duration skill, not an endurance task (proven for the strength/anaerobic null).

Where mental fatigue plausibly *does* bite in baseball is **skilled decision-making and attention over a long season/game**, not raw velocity. A systematic review found mixed evidence that mental fatigue degrades sport-specific skilled performance (plausible). Fatigue-linked frontal-lobe function loss is associated with worse impulse control and riskier decisions — the kind of thing that shows up as chase rates and command lapses late in outings, not a radar-gun drop.

**For Soto:** Do not sell "mental fatigue kills velo" — the data don't support it. Frame mental fatigue as a **command-and-decision** risk that compounds over a 162-game/long-travel season, and treat *sleep* as the primary countermeasure (below). For Triton, the interesting analytics question is whether late-game/late-season command metrics (`pitcher_season_command`) and chase-decision quality decay in patterns consistent with cumulative cognitive load — a novel, testable facility/analytics feature.

## Sleep as the Master Cognitive-Recovery Lever

For pitchers the strongest evidence-backed mental-recovery intervention is not meditation — it is sleep. The landmark work (Cheri Mah / Charles Czeisler collaborators, presented at SLEEP 2017) had pro baseball players from an MLB organization extend sleep for five nights:
- **Cognitive processing speed improved 13%** — reactions were **122 ms faster** on a visual-search test.
- **Selective attention with distractors improved by 66 ms.**
- Subjective fatigue dropped (proven within a small, applied sample).

Context: a fastball crosses the plate in ~400 ms, so a 60–120 ms swing in visual-processing speed is meaningful for hitters, and analogous attention/reaction gains matter for a pitcher's fielding, pickoffs, and pitch-to-pitch focus. Separately, sleepiness has been linked to career attrition in MLB — players reporting higher daytime sleepiness were more likely to be demoted or exit the league (plausible, observational). And a single night of inadequate sleep can slow reaction time an estimated 10–30% (plausible; commonly cited, methodology varies).

Sleep is covered in depth in `01-sleep.md`; the point here is that **mental recovery planning should lead with sleep hygiene and sleep extension**, then layer breathwork/mindfulness. Meditation cannot out-perform being chronically under-slept.

**For Soto:** In any Neptune athlete-monitoring product, sleep duration/quality should be the top-line recovery metric, and "bank sleep before high-stress competition" is a defensible, evidence-graded coaching cue. Trevor lived the 162-game grind — sleep debt and travel are the realistic enemies, not a lack of mindfulness apps.

## Mindfulness & Acceptance-Based Training for Athletes

Modern sport-psychology has largely moved from "control your thoughts" (traditional psychological-skills training) toward **mindfulness and acceptance** approaches — noticing thoughts/sensations without fighting them and re-directing attention to the task. The dominant protocols:
- **MAC (Mindfulness-Acceptance-Commitment)** — Gardner & Moore; typically 7–12 weeks, 7–12 sessions, ~1 h each.
- **MSPE (Mindful Sport Performance Enhancement)** — Kaufman et al.; ~4–6 weeks.
- **MMTS (Mindfulness Meditation Training for Sport)** — ~6 weeks, 12 sessions, ~30 min.
- **MBSR (Mindfulness-Based Stress Reduction)** — the 8-week clinical parent program.

Evidence from an 11-RCT meta-analysis (582 athletes; 305 male, 116 female, 161 unreported; ages 16–67):
- **Flow/"fluency": SMD +1.47** (95% CI 0.87–2.08) — large.
- **Performance: SMD +0.92** (95% CI 0.40–1.43) — large.
- **Mindfulness level: SMD +1.08** (95% CI 0.30–1.86) — large.
- **Anxiety: SMD –0.87** (95% CI –1.54 to –0.20) — large reduction.
- Best dosing: **7–12 weeks, ~1 h per session** (promising — effect sizes are large but CIs are wide and samples small, so treat magnitudes as optimistic).

Converging meta-analyses report that mindfulness-based programs reduce competitive anxiety with **greater reductions in cognitive anxiety than somatic anxiety**, and that longer interventions (>7 weeks, >60 min sessions) and adolescent/individual-sport athletes show the strongest effects (promising). Head-to-head, CBT tends to show moderate-to-large effects on anxiety while mindfulness shows moderate-to-large effects with a distinct emphasis on present-moment attention and acceptance rather than thought-restructuring.

The honest caveat: these are small-sample, publication-bias-prone literatures (same problem as mental fatigue). The *direction* is reliable — mindfulness helps flow, attention, and anxiety — but the large effect sizes will likely regress with bigger trials.

**For Soto:** For Neptune, an acceptance-based mental-skills curriculum (MAC-style, 7–12 weeks) is a legitimate, evidence-graded program to offer, especially for HS/college pitchers with performance anxiety. Do not promise "large" performance gains; promise better attentional control, competitive-anxiety reduction, and more consistent access to flow. This dovetails with what Tread Athletics already sells (Mental Skills 101), so it's a proven market.

## Breathwork & HRV Biofeedback: Fast Arousal Regulation

If mindfulness is the multi-week base-builder, **breathwork is the acute, in-the-moment down-regulator** — the tool a pitcher can deploy between pitches or before a high-leverage inning.

The mechanism: slow breathing at roughly **6 breaths/min (0.1 Hz)** produces resonance between respiratory-driven heart-rate oscillations (respiratory sinus arrhythmia) and the baroreflex, maximizing heart-rate variability and shifting autonomic balance toward parasympathetic (calming) dominance. This is the basis of **HRV biofeedback (HRV-BFB)**, where athletes train to breathe at their individual "resonance frequency" (proven physiology).

Evidence:
- **Acute mood/arousal:** A Stanford RCT (Balban, Huberman, Spiegel et al., *Cell Reports Medicine*, Jan 2023) randomized **111 participants** to 5 min/day for 28 days of one of three breathwork styles or mindfulness meditation. **Cyclic sighing** (double inhale through the nose, long slow exhale) produced the largest reduction in respiratory rate and the biggest improvement in positive affect; the controlled-breathing groups' "good feelings" rose ~**1.91 points** above baseline, beating meditation. Effects were measurable after a single 5-min session and grew over 28 days (promising).
- **Athletic performance from HRV-BFB:** A systematic review found **inconsistent** effects on actual sport performance — some studies (e.g., karate kata scores) improved, others null (plausible for performance, not proven). What is **consistent** is reduced anxiety and better stress buffering (e.g., athletes under university-exam stress showed benefits; VR nature-scenery HRV-BFB buffered perceived stress, reduced mind-wandering, preserved attention) (promising).

Bottom line: breathwork reliably **lowers arousal and anxiety and improves mood acutely**; its direct effect on throwing performance is unproven, but calmer, less-aroused execution in high-leverage moments is a reasonable target. Practical protocols to teach:
- **Cyclic/physiological sigh:** double inhale + long exhale, a few reps for a fast reset.
- **Resonance-frequency / ~6 breaths-min paced breathing:** ~4 s in, ~6 s out, for pre-outing or between-inning down-regulation.
- **Extended-exhale box variants:** longer exhale than inhale to bias parasympathetic tone.

**For Soto:** Breathwork is the highest ROI mental-recovery tool for a facility — near-zero cost, teachable in one session, and it slots directly into a pitcher's between-pitch routine. Neptune could layer an inexpensive HRV wearable (chest strap or finger sensor) to make resonance-frequency training concrete and to feed HRV trend data into the same recovery dashboard as RESTQ and sleep. Trevor can teach the physiological sigh from lived experience — it's exactly the kind of practical, non-woo tool that survives a former big-leaguer's bro-science filter.

## Sport Psychology Basics for Pitchers: Routines & Reset Protocols

Pitching is a self-paced, high-repetition skill performed under scrutiny, which makes it uniquely suited to **pre-performance routines (PPRs)** and **between-pitch reset protocols**. The evidence base is more practitioner-consensus than RCT, but the mechanism (attentional control, rumination-blocking, consistency of arousal) is sound (plausible-to-promising).

**Between-pitch reset (the core loop).** A robust reset has three components:
1. **Physical reset** — receive the ball, step off the rubber, adjust cap/glove, take one deliberate breath (often a full exhale to "release" the last pitch).
2. **Mental reset** — acknowledge and calm the emotion of the last pitch (good or bad), then clear it; return attention to the present.
3. **Tactical focus / single cue** — one clear intention for the next pitch (target + pitch), then commit.

Driveline (Starting Pitchers – Developing a Pre-Game Routine) and Tread Athletics (Mental Skills 101: routines, breathing, arousal regulation, visualization, alter ego) both build programming around this. The ABCA "Quick Pitch" mound-routine material teaches the same step-off/breath/commit sequence. The unifying principle: a routine **occupies the mind with process cues** so the pitcher is "less likely to think results and more likely to focus on execution, one pitch at a time."

**Pre-game routine (the macro version).** Consistent warm-up timing, bullpen structure, and a fixed sequence of physical and mental preparation reduce variability in arousal state at first pitch. The goal is to arrive at the **individual optimal arousal zone** (Inverted-U / IZOF): moderate, individualized arousal — not maximally hyped, not flat.

**Perfectionism is the failure mode.** Sport-psych literature on pitchers flags maladaptive perfectionism as a driver of choking and rumination — the pitcher who treats every miss as catastrophic loses the reset. Acceptance-based training (above) and a disciplined reset routine are the antidotes (plausible).

**Visualization / imagery and self-talk** round out the standard pitcher toolkit — mental rehearsal of execution and instructional/motivational self-talk have moderate support in the broader sport-psych literature (promising).

**For Soto:** A Neptune pitcher-development program should ship a **standardized reset-routine template** (step-off → exhale → single cue) that athletes customize and rehearse in bullpens, plus a pre-game routine builder. This is content Trevor is ideally positioned to deliver on camera for Mayday Media — it's credible, practical, and differentiates from mechanics-only facilities. On Triton, note that command/chase-decision consistency across an outing is a plausible downstream signal of routine quality.

## Youth Baseball Burnout & Early Specialization

Burnout in young athletes is a **psychological syndrome of chronic stress**, defined by Raedeke & Smith (2001) with three dimensions, measured by the 15-item **Athlete Burnout Questionnaire (ABQ)** (5 items each, 5-point Likert; used in ~81% of burnout studies):
1. **Physical/emotional exhaustion** — fatigue from training/competition demands.
2. **Reduced sense of accomplishment** — feelings of inefficacy and negative self-evaluation.
3. **Sport devaluation** — loss of interest, detached/negative attitude toward the sport.

Smith's chronic-stress model frames burnout as the endpoint of stress that chronically outruns recovery, leading a young athlete to quit a previously enjoyable activity (proven as a construct). Drivers: striving for perfection, fear of missing out on normal peer experiences, and excessive coach/parent pressure — plus the physical grind of overtraining.

**The specialization link.** Early single-sport specialization is associated with both burnout and overuse injury (promising for burnout; proven for injury). Key numbers:
- Youth pitchers who compete with **arm fatigue are ~13.3x more likely** to suffer a shoulder or elbow injury (proven — the ASMI/Fleisig prospective finding that anchors pitch-count rules).
- **Tommy John surgery in 15–19-year-olds is rising ~9.1%/year** (proven trend); UCL surgery has become most prevalent in youth players chasing velocity.
- The AAP (2024) and multiple reviews recommend **delaying specialization** (often ~age 15), limiting single-sport volume, and enforcing pitch counts and rest to reduce overuse injury and burnout (promising consensus).
- Most current pro players (63.4%) believe pre-HS specialization was **not** required to reach the pros — undercutting the "specialize early or fall behind" pressure (survey evidence).

**Interventions work.** A 5-RCT meta-analysis (430 athletes, ages 11–23, mean 18.8) found significant burnout reductions across all three dimensions: **exhaustion d = –0.87, sport devaluation d = –0.77, reduced accomplishment d = –0.74** (all p < 0.05). Both CBT (~77% of studies) and mindfulness (~23%) helped, and **online delivery matched or beat in-person** for exhaustion and devaluation (promising, thin base — only 5 trials).

**For Soto:** If Neptune serves youth/travel/HS athletes (the likely core clientele), burnout and overuse prevention are not just ethics — they are the retention and reputation moat. Concrete facility policies: enforce pitch counts and mandatory rest windows, screen for arm fatigue *before* every high-volume outing (that 13.3x number is the headline), monitor ABQ-style burnout dimensions in the same dashboard as workload, actively encourage multi-sport participation before ~15, and coach parents/coaches on pressure. This is defensible, evidence-graded positioning that a commodity cage barn will not touch — and it protects the athletes whose long-term development is the facility's actual product.

## Putting It Together: A Mental-Recovery Monitoring Spine

A coherent system layers four evidence-graded tiers, cheapest/highest-leverage first:
1. **Sleep** (proven, highest leverage) — track duration/quality; extend before high-stress competition.
2. **Breathwork** (promising, near-zero cost) — teach cyclic sighing + ~6 breaths/min resonance breathing; optional HRV wearable.
3. **Routines** (plausible, high consensus) — standardized reset + pre-game routine; the operational backbone.
4. **Stress-recovery monitoring** (proven instrument) — periodic RESTQ-36/wellness check-ins, charted against workload; flag diverging stress/recovery trends.
5. **Mindfulness/acceptance curriculum** (promising) — 7–12 week MAC-style program for anxiety-prone or higher-level athletes.
6. **Burnout & overuse guardrails** (proven injury, promising burnout) — pitch counts, arm-fatigue screening, ABQ dimensions, multi-sport encouragement for youth.

The through-line for Soto: psychological load runs on the same nervous system as physical load, it is measurable, and folding a lightweight mental-recovery layer into the Compete/Neptune data spine is a low-cost, high-differentiation feature that a former-MLB-pitcher-led, tech-forward development lab is uniquely credible to deliver.

## Sources

1. RESTQ-Sport short version validation (elite swimmers) — PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC6349564/
2. RESTQ-Sport psychometric item evaluations (Davis & Orzeck) — PDF: https://www.hapdavisphd.ca/davis%20and%20orzeck%20RESTQ%20final%20published%20article.pdf
3. Kellmann, "Preventing overtraining in athletes in high-intensity sports and stress/recovery monitoring," Scand J Med Sci Sports 2010: https://onlinelibrary.wiley.com/doi/10.1111/j.1600-0838.2010.01192.x
4. Recovery-Stress Questionnaire overview — Psychology Roots: https://psychologyroots.com/recovery-stress-questionnaire-for-athletes/
5. "Mental Fatigue Might Be Not So Bad… A Bias-Sensitive Meta-Analysis," Journal of Cognition 2024: https://journalofcognition.org/articles/10.5334/joc.126
6. "Assessing the Evidential Value of Mental Fatigue and Exercise Research," Sports Medicine (Springer): https://link.springer.com/article/10.1007/s40279-023-01926-w
7. "Does mental fatigue affect skilled performance in athletes? A systematic review," PLOS One: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0258307
8. "Sleep extension improves response time, reduces fatigue in professional baseball players," ScienceDaily / AASM SLEEP 2017: https://aasm.org/sleep-extension-improves-response-time-reduces-fatigue-in-professional-baseball-players/
9. "A meta-analysis of the intervention effect of mindfulness training on athletes' performance," Frontiers in Psychology 2024 — PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC11210447/
10. "Effects of psychological interventions on anxiety in athletes: a meta-analysis," Frontiers in Psychology 2025 — PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC12368976/
11. Balban, Huberman, Spiegel et al., "Brief structured respiration practices enhance mood and reduce physiological arousal," Cell Reports Medicine 2023: https://www.cell.com/cell-reports-medecine/fulltext/S2666-3791(22)00474-8
12. "Cyclic sighing can help breathe away anxiety," Stanford Medicine: https://med.stanford.edu/news/insights/2023/02/cyclic-sighing-can-help-breathe-away-anxiety.html
13. "Effect of Heart Rate Variability Biofeedback on Sport Performance, a Systematic Review": https://www.researchgate.net/publication/317283987_Effect_of_Heart_Rate_Variability_Biofeedback_on_Sport_Performance_a_Systematic_Review
14. Driveline Baseball, "Starting Pitchers – Developing a Pre-Game Routine": https://www.drivelinebaseball.com/2016/08/starting-pitchers-developing-pre-game-routine/
15. Tread Athletics, "Mental Skills 101": https://courses.treadathletics.com/mental-skills-101
16. "Burnout and Mental Interventions among Youth Athletes: A Systematic Review and Meta-Analysis," PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC9517900/
17. "Overuse Injuries, Overtraining, and Burnout in Young Athletes," Pediatrics (AAP) 2024: https://publications.aap.org/pediatrics/article/153/2/e2023065129/196435/Overuse-Injuries-Overtraining-and-Burnout-in-Young
18. Raedeke & Smith, Athlete Burnout Questionnaire — scoping review of longitudinal studies, Frontiers 2025: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1502174/full
19. "Prevalence and Consequences of Sport Specialization Among Little League Baseball Players," PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC8083145/
