---
title: Privacy, PII & Athlete Data — Who Is In This Row and What You Owe Them
domain: entity-resolution
tags:
  - pii
  - biometric-data
  - minors
  - consent
  - encryption-at-rest
  - blind-index
  - access-control
  - retention
sources_reviewed: 17
last_updated: 2026-08-12
---

# Privacy, PII & Athlete Data — Who Is In This Row and What You Owe Them

> Grades: **(established)** law/standard read at the source; **(computed)** verified against Triton
> source at the cited line, read not queried; **(estimated)** reasoned from those;
> **(folk-sabermetrics)** repeated in facilities and wrong. Engineering advice, not legal advice;
> statutes are cited so counsel can check the readings.

## TL;DR

- **Two athlete populations, opposite postures, no schema distinction.** `players` is 16,931 public-figure MLB rows on a league-published ID; `compete_pitches` is 443 rows on **6 private people**. **(computed)**
- **Almost nothing here is legally "biometric" — but the Whoop stream is health data.** Art. 9 biometrics require processing *to uniquely identify*; BIPA enumerates retina/iris, fingerprint, voiceprint and hand/face geometry, excluding physical descriptions. HRV, SpO₂, skin temp and sleep are Art. 9 health data regardless. **(established)**
- **"It's ball flight, not personal data" is the facility's favorite wrong sentence.** The physics is not what makes the row sensitive; the name attached to it is. **(folk-sabermetrics)**
- **HIPAA almost certainly does not apply and designing to it is a category error; the FTC Health Breach Rule probably does** — it reaches non-HIPAA health-app vendors. **(established)**
- **COPPA stops at 13; the modal facility athlete is 14–18** and is covered by state law instead — its 2025 amendments (effective 2025-06-23, compliance 2026-04-22) reach under-13s only. **(established)**
- **The ciphertext has no key identifier and a 256-bit key is silently truncated to 128 bits.** "Which key encrypted this row?" is unanswerable — the same defect as "which baseline scored this row?" **(computed — `lib/encryption.ts:19`, `:33`)**
- **Encrypting Whoop `raw_data` buys less than it looks: the physiology sits in plaintext columns beside it** — `hrv_rmssd`, `resting_heart_rate`, `spo2_pct`, `skin_temp_celsius`. **(computed — `lib/compete/whoop.ts:244–253`)**
- **`compete_pitches` cannot service a deletion request: 0 of 443 rows carry `athlete_profile_id`.** Entity resolution isn't adjacent to privacy compliance; it is the precondition. **(computed)**
- **The two facility tables encode opposite erasure semantics and the older is backwards** — deleting the *uploader's* profile destroys every athlete's pitches; deleting the *athlete's* only nulls a link. **(computed)**
- **The biomech report bucket is `public = true`, no table has a retention column, and nothing logs reads of health rows** — three cheap fixes, one a live exposure. **(computed)**

---

## 1. Two populations, one database

Li's habit — *name the population first* — is also the privacy rule.

| | **Public-figure players** | **Facility athletes** |
|---|---|---|
| Tables | `players`, `pitches`, Retrosheet/Lahman | `athlete_profiles`, `compete_pitches`, `biomech_*`, `whoop_*` |
| Scale | 16,931 people, MLBAM 110001–842249 | 6 athletes, 443 pitches, one date (2026-04-13) |
| Identity key | league-published MLBAM ID | **none** — `tm_pitcher_id` + plaintext `pitcher_name` |
| Minors / health data | no / no | **likely** / yes (Whoop, mocap) |
| Rights exposure | negligible | access, deletion, consent withdrawal, breach notice |

Scope privacy work to the right column — the identity problem lives there too. The missing crosswalk
that makes facility analytics unreliable is what makes privacy rights unexecutable. **(computed)**

---

## 2. What applies, and what does not

| Regime | Trigger | Reaches Triton? | Demands here |
|---|---|---|---|
| **HIPAA** | covered entity or business associate | **No**, unless an in-house ATC/PT bills insurance | — |
| **FTC Health Breach Rule** | non-HIPAA vendor of personal health records / health apps | **Likely yes** | notice to individuals, FTC, sometimes media |
| **WA MHMDA** (RCW 19.373) | WA residents' consumer health data; no revenue floor | **Yes if one athlete is in WA** | separate consent to collect *and* share, notice, deletion, **private action** |
| **COPPA** (16 CFR 312, am. 2025) | knowingly collecting from **under-13s** | Only if you enroll a 12-year-old | parental consent, **retention policy** |
| **BIPA** (740 ILCS 14) | retina/iris, fingerprint, voiceprint, hand/face geometry, in IL | **No** for TrackMan; **arguable** for mocap resolving face geometry | published policy + release; private right of action |
| **CO HB24-1130** / **TX CUBI** | biometric identifiers; CO includes employees | Only with CO/TX operations | consent, policy, destruction schedule; AG only |
| **GDPR/UK GDPR** | offering to, or monitoring, people in the EU/UK | Only if you target them | Art. 9, Art. 17 erasure, Art. 32 |

*(All rows: **established**. CCPA/CPRA omitted — thresholds almost certainly not met; if they are,
the binding pieces are SPI limits and under-16 opt-in.)*

**Biometric ≠ body data.** Art. 4(14) requires processing that *allows or confirms unique
identification*, and Art. 9 bites only when that is the purpose; TrackMan release points and Captury
joint angles come from someone already named, so they are ordinary personal data. BIPA is narrower
still: an enumerated list, photographs and physical descriptions carved out. **Health data is
broader, and that is the real exposure** — HRV, SpO₂, skin temperature and sleep architecture are
Art. 9 "data concerning health" and inside MHMDA's definition, which reaches vital signs. Triton's
most-regulated asset is the wearable feed, not the ball flight. (FERPA is a red herring: it binds a
federally funded school's education records, and matters only when a college shares data *to* you.)

---

## 3. Minors — the 13-to-18 gap nobody covers

A Neptune-style facility serves 12–22. COPPA covers the bottom sliver; the middle band is consent
doctrine and state law.

| Band | Federal | Practical control |
|---|---|---|
| **< 13** | COPPA in full: parental consent, written retention policy, biometrics in scope | **Do not create accounts for under-13s** — a DOB gate and a hard refusal removes the regime |
| **13–17** | **none — COPPA does not apply** | The guardian consents, not the minor; store guardian identity, consent and scope as columns |
| **18+** | none | Ordinary consent, but withdrawal must be executable |

Two rules follow. **Consent is temporal data, not a boolean** — a valid-time interval, a
version of the text agreed to, and a granter who may not be the subject; model it as
`temporal-modeling/02-bitemporal-modeling.md` models anything else that was true for a while, because
`consented boolean` is unauditable the day someone asks what they agreed to in April. **Aging out is
an event** — guardian consent expires at 18 and needs re-consent: a job, not a hope. **(estimated)**

---

## 4. Triton's crypto layer, read honestly

`lib/encryption.ts` gets the primitives right; every defect is at the key-management layer.

| Property | Implementation | Verdict |
|---|---|---|
| Cipher / auth tag | AES-256-GCM, tag stored and checked (`:30`, `:33`, `:48`) | **Correct** — AEAD; tampering fails closed |
| IV | 12 random bytes per call (`:29`) | **Correct** — SP 800-38D RBG construction; the ~2³² invocations-per-key ceiling is no concern here *(estimated)* |
| Key derivation | none; raw env bytes are the key (`:19`) | **Defect** — no KDF, no salt |
| Key entropy | `key.slice(0, 32)` over UTF-8 | **Defect** — a 64-hex-char (256-bit) key yields **128 bits**; 32 printable ASCII chars ≤ ~209. Neither warns |
| Key identifier | absent from the format | **Defect** — no incremental rotation, no attribution |
| Blind index | HMAC-SHA256, one global key (`:58–63`) | **Partial** — no domain separation |

### 4.1 The key-version defect is the baseline-vintage defect

`encrypt()` returns `iv:tag:ciphertext` and nothing else, so rotation cannot be incremental — you
cannot write new rows under a new key and migrate the rest lazily, because nothing distinguishes
them. It becomes a synchronized decrypt-all/re-encrypt-all with an outage window, so it never
happens. Fix: `v1:iv:tag:ciphertext`, `decrypt` dispatching on the prefix, legacy strings
defaulting to `v1`. Same shape as the platform's flagship metric defect — a stored value whose
inputs are unrecoverable because nothing recorded which were in force
(`metric-governance/02-metric-versioning-reproducibility.md`). **(estimated)**

### 4.2 What the blind index hides, and what it does not

`blindIndex(value)` is a deterministic HMAC letting `newsletter_subscribers` upsert on `email_hash`
without decrypting — right pattern, and the UNIQUE index makes dedup work. Two limits.
**Determinism leaks equality**: the column shows which rows share a value — fine for email, but a
future `name_hash` would let any reader correlate people without decrypting. **One key, no
domain separation**: the same value in two tables yields the same digest, an accidental cross-table
join key — add `HMAC(key, table||column||value)` while there is one caller. Truncating the index to
bucket rather than identify is **unavailable**: dedup depends on UNIQUE. Separately,
`migrate-newsletter-encryption.sql:17` still carries `DROP COLUMN … email` as a comment: until it
runs, every address is in plaintext *and* ciphertext in the same row — worse than no encryption,
because it is reported as done. **(estimated / computed)**

### 4.3 What encryption does not buy you

`syncWhoopData` encrypts the vendor envelope and writes the extracted fields in the clear:
`recovery_score`, `hrv_rmssd`, `resting_heart_rate`, `spo2_pct`, `skin_temp_celsius`, `sleep_score`,
`sleep_efficiency`, `respiratory_rate`. Those *are* the health data, and every `is_admin()` user
reads them unlogged, without touching a key. Not an argument for encrypting those columns — that
destroys the aggregation, indexing and trending that are the product. An argument that **column
encryption is the wrong control here and access control is the right one**: app-layer encryption
helps when the reader is separated from the key; here the app holds both. Same asymmetry in
`compete_pitches`, whose `raw` jsonb keeps the CSV row — `pitcher_name` included — unencrypted, so
redacting the promoted column leaves the name in the blob. **(computed)**

---

## 5. Identity is the precondition, not a side quest

Of 443 `compete_pitches` rows, **443 carry `tm_pitcher_id` and `pitcher_name`; 0 carry
`athlete_profile_id`** — the nullable FK that would tie a pitch to a consenting, access-controlled
person (`create-compete-pitches.sql:51`). Amateur athletes have no MLBAM ID, so that FK is the only
anchor. Every privacy right is a query; none can be written today:

| Right | Query it needs | Executable? |
|---|---|---|
| Access, export, erasure | all rows about person P | **No** — fuzzy name match only |
| Consent withdrawal | mark P's rows non-processable | **No** |
| Breach notification | whose data was in the affected rows | **No** — names, not people |
| Retention expiry | rows about P older than N | **No** |

The crosswalk is therefore compliance infrastructure, not analytics hygiene — and name matching
alone will not carry it: `players` has two name formats and **513 duplicate-name collisions** in
16,931 rows. See `03-name-matching-algorithms.md`, `08-facility-athlete-linking.md`. **(computed)**

### 5.1 The cascades are backwards in the older table

| Table | Subject FK | Uploader FK | Delete the athlete's profile | Delete the uploader's |
|---|---|---|---|---|
| `compete_pitches` | `on delete set null` (`:51`) | `on delete cascade` (`:50`) | row survives with plaintext name + `raw` — **erasure does not erase** | **every athlete's pitches destroyed** |
| `biomech_captures` | `on delete cascade` (`:19`) | `on delete set null` (`:20`) | capture and throws removed — correct | data survives, attribution nulls — correct |

Same repo, inverted on both axes: a coach leaving deletes athlete data; an athlete exercising
erasure does not. **(computed)**

---

## 6. Access control as it actually stands

`scripts/enable-rls.sql` is serious work — 70+ tables, explicit policies — but its own header states
the limit: **~95% of API routes use the service-role key, which bypasses RLS, and `run_query` is
SECURITY DEFINER** (`:5–7`). RLS is defense-in-depth here, not the primary control.

| Surface | Policy | Problem |
|---|---|---|
| `compete_pitches` | `uploaded_by = auth.uid() or is_compete_admin()` (`:171–176`) | **Wrong party** — the athlete cannot read their own pitches; the coach who uploaded someone else's CSV can |
| `whoop_cycles/sleep/workouts` | `athlete_id = my_athlete_id() or is_admin()` (`:76–94`) | Subject-correct, but `is_admin()` is binary — any admin reads any athlete's physiology |
| `biomech_captures/throws` | `is_compete_admin() or owns_athlete_profile(…)` (`:96–102`) | Correct — the model to copy |
| `whoop_tokens`, `newsletter_subscribers` | RLS on, no policies = deny all | Correct, as are the private `biomech-captures` and `trackman-raw` buckets |
| `biomech-reports` bucket | `public = true` (`:113–116`) | **World-readable.** UUID-path obscurity is not access control — URLs leak via referrers and shares |
| Read logging | none | Nothing records who read an athlete's health rows |

Missing is the middle tier: nothing expresses "this coach, for these athletes, this season" — the
relationship table that fixes §5. **(computed)**

---

## 7. Retention, minimization, and the tension Li has to name

No athlete table carries a retention or destruction column, while amended COPPA, CO, TX and BIPA
each require a written schedule for the data they cover. The honest tension: **Li normally
argues for keeping raw payloads** — `raw` and `raw_meta` make a metric recomputable when a parser
changes (`metric-governance/04-materialize-vs-compute-time.md`) — while minimization argues for
deleting them; both are right, about different rows: **(estimated)**

| Class | Example | Retain | Why |
|---|---|---|---|
| Derived measurements | `rel_speed`, `induced_vert_break`, `metrics` | indefinitely, keyed to a profile | the product; personal, not sensitive |
| Vendor raw envelopes | `compete_pitches.raw`, `whoop_*.raw_data` | 12–24 months, encrypted, then drop | reprocessing value decays fast; identifiability does not |
| Media / credentials | C3D captures, video, `whoop_tokens` | shortest defensible window; tokens until disconnect | highest sensitivity per byte |
| Consent records | grants, guardian identity | **longer than the data they authorize** | the only proof a deletion was authorized |

Expiry needs a job and a monitor or it is a comment in a policy document — the dead-man side is
**Jo**'s (`Jo/data-reliability/02-data-freshness-slos.md`). Fixtures from these tables must be
pseudonymized — **Cas**'s (`Cas/testing-data-systems/08-test-data-management.md`). Whether a metric
should exist at all over 6 athletes is **Soto**'s
(`Soto/algorithm-design/11-facility-athlete-analytics.md`).

---

## 8. What Triton should do, in order

1. **Backfill `athlete_profile_id` on all 443 `compete_pitches` rows** from `tm_pitcher_id` — 6 athletes, a manual crosswalk — then make it `NOT NULL`. Nothing below is executable until a subject is addressable; see `Jo/data-quality/11-remediation-backfill-safety.md`.
2. **Flip `biomech-reports` to private**, serving PDFs through short-TTL signed URLs — one line, and it closes a live world-readable exposure.
3. **Fix the `compete_pitches` cascades**: subject FK → `ON DELETE CASCADE`, uploader FK → `ON DELETE SET NULL`, as in `biomech_captures`.
4. **Fix `lib/encryption.ts` in one commit**: version the ciphertext (`v1:…`), decode a hex/base64 key rather than slicing 32 characters, and give `blindIndex` a domain parameter.
5. **Finish the newsletter migration** — verify `email_hash` coverage, then run the commented `DROP COLUMN email`.
6. **Add a consent model**: `athlete_consents` (subject, granter, policy version, scope, `valid_from`/`valid_to`), `date_of_birth` on `athlete_profiles`, an under-13 refusal, and a job expiring guardian consent at 18.
7. **Add retention columns and a nightly expiry job** per §7, starting with raw blobs and media, and publish the schedule — under BIPA and CO the written policy *is* the obligation.
8. **Add a coach↔athlete relationship table**, narrow `is_admin()` reads of `whoop_*` to it, and log reads of health rows — `metric-governance/10-audit-trails-provenance.md` has the append-only pattern.
9. **Write a consumer-health-data notice** (MHMDA-shaped) **and an incident runbook** naming the FTC Health Breach Rule path.

**Anti-recommendation — do not answer this by encrypting athlete columns wholesale** (pgcrypto,
`pgsodium`, or app-layer `encrypt()` on `rel_speed`, `hrv_rmssd` and friends). The move that most
feels like taking privacy seriously fails three independent ways. **(i) It destroys the
product** — encrypted columns cannot be indexed, ranged, aggregated or joined, so every leaderboard,
percentile and session comparison over facility data stops working. **(ii) It targets a threat model
already covered** — it defends against reading storage without the application, which Supabase's
at-rest encryption already does, while the exposures measured here are a public bucket, an
over-broad admin predicate, a service-role key bypassing RLS, and an unresolvable subject.
**(iii) The key sits with the reader** — `ENCRYPTION_KEY` lives in the same Vercel environment the
app reads it from.

**Single highest-leverage next action:** backfill `athlete_profile_id` for the 443 `compete_pitches`
rows and add the `NOT NULL` constraint — under an hour at six athletes, and it turns every right in
§5 from "not expressible as a query" into a `WHERE` clause.

---

## Sources

1. [GDPR Art. 4](https://gdpr-info.eu/art-4-gdpr/) — 4(14)'s identification requirement, which keeps mocap out of Art. 9.
2. [GDPR Art. 9](https://gdpr-info.eu/art-9-gdpr/) — the health head Whoop's data falls under.
3. [GDPR Art. 17](https://gdpr-info.eu/art-17-gdpr/) — the erasure duty §5 shows Triton cannot meet.
4. [GDPR Art. 32](https://gdpr-info.eu/art-32-gdpr/) — encryption as an *example* measure, per §4.3.
5. [740 ILCS 14 — BIPA (Justia)](https://law.justia.com/codes/illinois/chapter-740/act-740-ilcs-14/) — the enumerated definition and its carve-outs.
6. [Morrison Foerster — Biometric identifiers must identify](https://www.mofo.com/resources/insights/240503-getting-bipa-right-biometric-identifiers-must-identify) — the reading the mocap call turns on.
7. [DWT — BIPA damages amendment (2024)](https://www.dwt.com/blogs/privacy--security-law-blog/2024/08/illinois-bipa-biometrics-law-amended-for-damages) — the post-*Cothron* cap that sizes BIPA risk.
8. [Tex. Bus. & Com. Code § 503.001 (CUBI)](https://statutes.capitol.texas.gov/Docs/BC/htm/BC.503.htm) — the one-year destruction rule in §7.
9. [Colorado HB24-1130](https://leg.colorado.gov/bills/hb24-1130) — consent, policy and destruction schedule, employees included.
10. [RCW Ch. 19.373 — My Health My Data Act](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373&full=true) — the consumer-health-data definition §2 treats as strictest.
11. [Federal Register — COPPA final amendments (2025-04-22)](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) — the 2025-06-23 / 2026-04-22 dates and the retention duty.
12. [16 CFR Part 312 (eCFR)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312) — the Rule text behind §3's under-13 line.
13. [FTC — Health Breach Notification Rule](https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule) — the non-HIPAA breach path Whoop ingest triggers.
14. [HHS — Covered entities and business associates](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html) — the test keeping a non-billing facility outside HIPAA.
15. [NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final) — GCM IV rules, validating the 12-byte nonce.
16. [NIST SP 800-57 Pt. 1 Rev. 5](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final) — cryptoperiods, unmeetable without a key id.
17. [Paragon — Searchable encrypted databases](https://paragonie.com/blog/2017/05/building-searchable-encrypted-databases-with-php-and-sql) — the blind-index design and its equality leak.

**Triton-internal evidence.** `lib/encryption.ts`: format `:29–33`, key handling `:14–20`, decrypt
`:42–50`, `blindIndex` `:58–63`. Plaintext physiology beside the encrypted envelope at
`lib/compete/whoop.ts:244–253`, `:260–274`, `:280–296`; tokens `:114–115` and
`app/api/compete/whoop/callback/route.ts:48–49`. Newsletter migration incomplete:
`scripts/migrate-newsletter-encryption.sql:8–17`, blind index `:13–14`, backfill
`scripts/backfill-newsletter-encryption.ts:58–60`. `scripts/create-compete-pitches.sql:50`
(`uploaded_by … on delete cascade`), `:51` (`athlete_profile_id … on delete set null`, nullable),
`:141` (`raw` jsonb), RLS `:164–176`; contrast `scripts/create-biomech-captures.sql:19–20` (cascades
correct), `:96–102`, `:113–116` (**`biomech-reports` created `public = true`**). `scripts/enable-rls.sql:5–7` (service-role bypass, per its own header), `:56–70`, `:76–94` (unscoped `is_admin()`), `:96–102`, `:254–264` — no retention, expiry or
access-log column appears anywhere in it. `lib/roles.ts:16–36`. **Measured centrally 2026-08-12,
quoted not re-run:** `compete_pitches` 443 rows / 6 athletes / one session date 2026-04-13, all 443
with `tm_pitcher_id` + `pitcher_name`, **0 with `athlete_profile_id`**; `players` 16,931 rows, MLBAM
110001–842249, 16,474 `"Last, First"` vs 457 `"First Last"`, 553 non-ASCII names, 513 duplicate-name
collisions.
