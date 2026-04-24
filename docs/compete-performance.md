# Compete — Performance Page

## Current State (v1 shipped)
- Page: `app/(compete)/compete/performance/page.tsx`
- Nav tab added to `CompeteNav.tsx` after Monitor
- Uses `papaparse` for client-side CSV parsing
- Upload via drag-and-drop or click-to-browse
- Arsenal metrics table: Pitch Type, #, Velo, Max, Spin, Tilt (mode), IVB, HB, VAA, RelH, RelS, Ext, SpinEff%
- Pitcher selector dropdown (multi-pitcher files), session filter (All/Warmup/Live), totals row
- Pitch type colors: local `TM_COLORS` map with fallback to `getPitchColor()` from chartConfig

## Sample Data
- 442 pitches, 6 pitchers, 73 columns
- Pitch types: Fastball, Sinker, Cutter, Curveball, Slider, Sweeper, ChangeUp, Knuckleball, Splitter

## Available CSV Columns (not yet used)
### Location
- **PlateLocHeight**, **PlateLocSide** — plate location (strike zone plot candidate)

### Pitch Context
- Date, Time, PitcherSet, PitchCall, Balls, Strikes, Flag, PracticeType

### Velocity
- ZoneSpeed, EffVelocity (only RelSpeed used currently)

### Spin (advanced)
- SpinAxis3dTransverseAngle, SpinAxis3dLongitudinalAngle, SpinAxis3dActiveSpinRate, SpinAxis3dTilt

### Release
- VertRelAngle, HorzRelAngle

### Movement
- VertBreak (total), pfxx, pfxz

### Trajectory (initial conditions)
- x0, y0, z0, vx0, vy0, vz0, ax0, ay0, az0

### Batted Ball
- BatterId, Batter, BatterSide, HitType, ExitSpeed, Angle, Distance, LastTrackedDistance, HangTime, Bearing, HitSpinRate, ContactPositionX/Y/Z, PositionAt110X/Y/Z

## Future Ideas
- Strike zone scatter plot (PlateLocHeight × PlateLocSide) colored by pitch type
- Release point plot (RelSide × RelHeight)
- Movement plot (HB × IVB)
- Batted ball outcomes tab (EV, LA, distance)
- Session-over-session trending (upload multiple CSVs)
- Per-pitch detail table with expandable rows
- Rapsodo CSV format support (different column names)
