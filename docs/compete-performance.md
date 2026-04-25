# Compete — Performance Page

## Current State
- Page: `app/(compete)/compete/performance/page.tsx`
- Nav tab added to `CompeteNav.tsx` after Monitor
- CSV parsing: client-side via `papaparse`
- **Uploaded data is persisted to Supabase.** Page loads the viewer's session history on mount and lets you pick any prior session.
- Arsenal metrics table: Pitch Type, #, Velo, Max, Spin, Tilt (mode), IVB, HB, VAA, RelH, RelS, Ext, SpinEff%
- Pitcher selector (multi-pitcher files), session filter (All/Warmup/Live), totals row
- Pitch type colors: local `TM_COLORS` map with fallback to `getPitchColor()` from `chartConfig`

## Data flow
1. User drops a TrackMan CSV → Papa parses client-side into `PitchRow[]`.
2. Page POSTs `{ fileName, rows }` to `/api/compete/performance/upload`.
3. Route creates a `compete_pitch_sessions` row and bulk-upserts into `compete_pitches` (chunks of 500, conflict key `tm_pitch_uid` → ignore duplicates, so re-uploading the same CSV is a no-op).
4. Page refreshes the session list and auto-selects the just-uploaded session, pulling pitches back through `/api/compete/performance/pitches?session_id=…`.

All rows in the CSV are ingested regardless of pitcher. The arsenal UI defaults to "All Pitchers" and includes a pitcher selector for multi-pitcher files.

## Database

### `compete_pitch_sessions`
One row per upload (or future API sync).
- `id`, `uploaded_by` (→ `profiles.id`), `uploaded_at`, `source` (`csv_upload` | `trackman_api` | …), `file_name`, `session_date`, `tm_session_id`, `pitch_count`, `raw_meta jsonb`

### `compete_pitches`
One row per pitch, 73 columns mirroring the TrackMan schema plus:
- `session_id` (FK), `uploaded_by`, `athlete_profile_id` (nullable, reserved for future pitcher-linking)
- `tm_pitch_uid` **unique** — idempotency key
- `raw jsonb` — forward-compat slot for future TrackMan columns we haven't promoted

See `scripts/create-compete-pitches.sql` for the full DDL.

### Indexes
- `compete_pitch_sessions`: `uploaded_by`, `session_date`, `tm_session_id`
- `compete_pitches`: `session_id`, `uploaded_by`, `athlete_profile_id`, `tm_pitcher_id`, `pitch_date`, `tagged_pitch_type`

### RLS model
- `public.is_compete_admin()` — returns true for `profiles.role IN ('admin','owner')`
- SELECT / DELETE: own rows OR admin
- INSERT: must be `uploaded_by = auth.uid()`
- API routes use the **service-role** admin client (bypasses RLS) and enforce auth explicitly. RLS is defense-in-depth for any future direct client queries.

## Admin behavior
Admins (`role = 'admin' | 'owner'`) see every session from every uploader in both the empty-state list and the session dropdown, with an "Uploaded by {name}" line visible on the toolbar when viewing someone else's session.

## API routes
- `POST /api/compete/performance/upload` — body `{ fileName, rows: PitchRow[], source? }` → `{ sessionId, inserted, skipped, total }`
- `GET /api/compete/performance/sessions` → `{ sessions: SessionSummary[], isAdmin }`. Summary includes `uploader_name`.
- `GET /api/compete/performance/pitches?session_id=…` → `{ rows: PitchRow[] }`

## Shared types / mappers
`lib/compete/pitchSchema.ts`
- `PitchRow` — canonical in-memory shape (PascalCase, matches CSV column names)
- `parseCsvRow(raw)` — CSV row → `PitchRow`
- `rowToDb(row, { session_id, uploaded_by })` — `PitchRow` → snake_case insert
- `dbToRow(db)` — DB row → `PitchRow`

## Pitcher → athlete linking (deferred)
`compete_pitches.athlete_profile_id` is reserved but currently always `null`. When ready:
1. Add `tm_pitcher_id` (text) to `athlete_profiles`.
2. Backfill by matching TrackMan `PitcherId` values to athletes.
3. Update `rowToDb` / upload route to populate `athlete_profile_id` at insert time, and backfill existing rows.

## Future TrackMan API integration
The insert path is decoupled from the upload UI — a cron-driven TrackMan pull would hit the same `compete_pitches` table with `source = 'trackman_api'` on the session row. No UI changes required.

## Sample Data
- 442 pitches, 6 pitchers, 73 columns
- Pitch types: Fastball, Sinker, Cutter, Curveball, Slider, Sweeper, ChangeUp, Knuckleball, Splitter

## CSV Schema — captured fields (73 columns)
All TrackMan pitching columns are ingested and stored. Numeric fields → `number | null`; identifier-like fields stay as strings.

### Pitch context (14)
PitchNo, Date, Time, Pitcher, PitcherId, PitcherThrows, PitcherTeam, PitcherSet, PitchCall, Balls, Strikes, TaggedPitchType, PitchSession, Flag

### Release / velocity (9)
RelSpeed, VertRelAngle, HorzRelAngle, SpinRate, SpinAxis, Tilt, RelHeight, RelSide, Extension

### Movement (3)
VertBreak, InducedVertBreak, HorzBreak

### Plate / approach (8)
PlateLocHeight, PlateLocSide, ZoneSpeed, VertApprAngle, HorzApprAngle, ZoneTime, pfxx, pfxz

### Trajectory — initial conditions (9)
x0, y0, z0, vx0, vy0, vz0, ax0, ay0, az0

### Identifiers / metadata (6)
PlayID, CalibrationId, EffVelocity, PracticeType, Device, Direction

### Batter / batted ball (16)
BatterId, Batter, HitSpinRate, HitType, ExitSpeed, BatterSide, Angle, PositionAt110X/Y/Z, Distance, LastTrackedDistance, HangTime, Bearing, ContactPositionX/Y/Z

### 3D spin axis (5)
SpinAxis3dTransverseAngle, SpinAxis3dLongitudinalAngle, SpinAxis3dActiveSpinRate, SpinAxis3dSpinEfficiency, SpinAxis3dTilt

### UIDs (2)
PitchUID, SessionId

## Future Ideas (UI)
- Strike zone scatter plot (PlateLocHeight × PlateLocSide) colored by pitch type
- Release point plot (RelSide × RelHeight)
- Movement plot (HB × IVB)
- Batted ball outcomes tab (EV, LA, distance)
- Session-over-session trending across an athlete's history
- Per-pitch detail table with expandable rows
- Rapsodo CSV format support (different column names)
