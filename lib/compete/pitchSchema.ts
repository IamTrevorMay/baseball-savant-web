// Shared TrackMan pitch schema used by both the Compete Performance page and the
// /api/compete/performance/* routes. The `PitchRow` shape mirrors the raw CSV column
// names (camelCase/PascalCase as TrackMan emits them). The DB shape is snake_case.
// Mappers below handle the round trip so neither side has to know about the other's
// naming convention.

export interface PitchRow {
  // Pitch context
  PitchNo: number
  Date: string
  Time: string
  Pitcher: string
  PitcherId: string
  PitcherThrows: string
  PitcherTeam: string
  PitcherSet: string
  PitchCall: string
  Balls: number | null
  Strikes: number | null
  TaggedPitchType: string
  PitchSession: string
  Flag: string

  // Release / velocity
  RelSpeed: number | null
  VertRelAngle: number | null
  HorzRelAngle: number | null
  SpinRate: number | null
  SpinAxis: number | null
  Tilt: string
  RelHeight: number | null
  RelSide: number | null
  Extension: number | null

  // Movement
  VertBreak: number | null
  InducedVertBreak: number | null
  HorzBreak: number | null

  // Plate / approach
  PlateLocHeight: number | null
  PlateLocSide: number | null
  ZoneSpeed: number | null
  VertApprAngle: number | null
  HorzApprAngle: number | null
  ZoneTime: number | null
  pfxx: number | null
  pfxz: number | null

  // Trajectory (initial conditions)
  x0: number | null
  y0: number | null
  z0: number | null
  vx0: number | null
  vy0: number | null
  vz0: number | null
  ax0: number | null
  ay0: number | null
  az0: number | null

  // Identifiers / metadata
  PlayID: string
  CalibrationId: string
  EffVelocity: number | null
  PracticeType: string
  Device: string
  Direction: string

  // Batter / batted ball
  BatterId: string
  Batter: string
  HitSpinRate: number | null
  HitType: string
  ExitSpeed: number | null
  BatterSide: string
  Angle: number | null
  PositionAt110X: number | null
  PositionAt110Y: number | null
  PositionAt110Z: number | null
  Distance: number | null
  LastTrackedDistance: number | null
  HangTime: number | null
  Bearing: number | null
  ContactPositionX: number | null
  ContactPositionY: number | null
  ContactPositionZ: number | null

  // 3D spin axis
  SpinAxis3dTransverseAngle: number | null
  SpinAxis3dLongitudinalAngle: number | null
  SpinAxis3dActiveSpinRate: number | null
  SpinAxis3dSpinEfficiency: number | null
  SpinAxis3dTilt: number | null

  // UIDs
  PitchUID: string
  SessionId: string
}

/** Parse a CSV cell into `number | null`. Empty / unparseable → null. */
export function num(v: unknown): number | null {
  if (v === '' || v === undefined || v === null) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

/** Parse a CSV cell into a trimmed string. */
export function str(v: unknown): string {
  if (v === undefined || v === null) return ''
  return String(v).trim()
}

/** Maps a raw CSV row object (keys = TrackMan column names) into a typed `PitchRow`. */
export function parseCsvRow(r: any): PitchRow {
  return {
    PitchNo: Number(r.PitchNo) || 0,
    Date: str(r.Date),
    Time: str(r.Time),
    Pitcher: str(r.Pitcher),
    PitcherId: str(r.PitcherId),
    PitcherThrows: str(r.PitcherThrows),
    PitcherTeam: str(r.PitcherTeam),
    PitcherSet: str(r.PitcherSet),
    PitchCall: str(r.PitchCall),
    Balls: num(r.Balls),
    Strikes: num(r.Strikes),
    TaggedPitchType: str(r.TaggedPitchType),
    PitchSession: str(r.PitchSession),
    Flag: str(r.Flag),

    RelSpeed: num(r.RelSpeed),
    VertRelAngle: num(r.VertRelAngle),
    HorzRelAngle: num(r.HorzRelAngle),
    SpinRate: num(r.SpinRate),
    SpinAxis: num(r.SpinAxis),
    Tilt: str(r.Tilt),
    RelHeight: num(r.RelHeight),
    RelSide: num(r.RelSide),
    Extension: num(r.Extension),

    VertBreak: num(r.VertBreak),
    InducedVertBreak: num(r.InducedVertBreak),
    HorzBreak: num(r.HorzBreak),

    PlateLocHeight: num(r.PlateLocHeight),
    PlateLocSide: num(r.PlateLocSide),
    ZoneSpeed: num(r.ZoneSpeed),
    VertApprAngle: num(r.VertApprAngle),
    HorzApprAngle: num(r.HorzApprAngle),
    ZoneTime: num(r.ZoneTime),
    pfxx: num(r.pfxx),
    pfxz: num(r.pfxz),

    x0: num(r.x0), y0: num(r.y0), z0: num(r.z0),
    vx0: num(r.vx0), vy0: num(r.vy0), vz0: num(r.vz0),
    ax0: num(r.ax0), ay0: num(r.ay0), az0: num(r.az0),

    PlayID: str(r.PlayID),
    CalibrationId: str(r.CalibrationId),
    EffVelocity: num(r.EffVelocity),
    PracticeType: str(r.PracticeType),
    Device: str(r.Device),
    Direction: str(r.Direction),

    BatterId: str(r.BatterId),
    Batter: str(r.Batter),
    HitSpinRate: num(r.HitSpinRate),
    HitType: str(r.HitType),
    ExitSpeed: num(r.ExitSpeed),
    BatterSide: str(r.BatterSide),
    Angle: num(r.Angle),
    PositionAt110X: num(r.PositionAt110X),
    PositionAt110Y: num(r.PositionAt110Y),
    PositionAt110Z: num(r.PositionAt110Z),
    Distance: num(r.Distance),
    LastTrackedDistance: num(r.LastTrackedDistance),
    HangTime: num(r.HangTime),
    Bearing: num(r.Bearing),
    ContactPositionX: num(r.ContactPositionX),
    ContactPositionY: num(r.ContactPositionY),
    ContactPositionZ: num(r.ContactPositionZ),

    SpinAxis3dTransverseAngle: num(r.SpinAxis3dTransverseAngle),
    SpinAxis3dLongitudinalAngle: num(r.SpinAxis3dLongitudinalAngle),
    SpinAxis3dActiveSpinRate: num(r.SpinAxis3dActiveSpinRate),
    SpinAxis3dSpinEfficiency: num(r.SpinAxis3dSpinEfficiency),
    SpinAxis3dTilt: num(r.SpinAxis3dTilt),

    PitchUID: str(r.PitchUID),
    SessionId: str(r.SessionId),
  }
}

export interface DbPitchInsert {
  session_id: string
  uploaded_by: string
  athlete_profile_id: string | null
  tm_pitch_uid: string | null

  pitch_no: number | null
  pitch_date: string | null
  pitch_time: string | null
  pitcher_name: string | null
  tm_pitcher_id: string | null
  pitcher_throws: string | null
  pitcher_team: string | null
  pitcher_set: string | null
  pitch_call: string | null
  balls: number | null
  strikes: number | null
  tagged_pitch_type: string | null
  pitch_session: string | null
  flag: string | null

  rel_speed: number | null
  vert_rel_angle: number | null
  horz_rel_angle: number | null
  spin_rate: number | null
  spin_axis: number | null
  tilt: string | null
  rel_height: number | null
  rel_side: number | null
  extension: number | null

  vert_break: number | null
  induced_vert_break: number | null
  horz_break: number | null

  plate_loc_height: number | null
  plate_loc_side: number | null
  zone_speed: number | null
  vert_appr_angle: number | null
  horz_appr_angle: number | null
  zone_time: number | null
  pfxx: number | null
  pfxz: number | null

  x0: number | null; y0: number | null; z0: number | null
  vx0: number | null; vy0: number | null; vz0: number | null
  ax0: number | null; ay0: number | null; az0: number | null

  play_id: string | null
  calibration_id: string | null
  eff_velocity: number | null
  practice_type: string | null
  device: string | null
  direction: string | null

  tm_batter_id: string | null
  batter_name: string | null
  hit_spin_rate: number | null
  hit_type: string | null
  exit_speed: number | null
  batter_side: string | null
  angle: number | null
  position_at_110_x: number | null
  position_at_110_y: number | null
  position_at_110_z: number | null
  distance: number | null
  last_tracked_distance: number | null
  hang_time: number | null
  bearing: number | null
  contact_position_x: number | null
  contact_position_y: number | null
  contact_position_z: number | null

  spin_axis_3d_transverse_angle: number | null
  spin_axis_3d_longitudinal_angle: number | null
  spin_axis_3d_active_spin_rate: number | null
  spin_axis_3d_spin_efficiency: number | null
  spin_axis_3d_tilt: number | null

  tm_session_id: string | null
  raw: Record<string, unknown> | null
}

const orNull = (s: string) => (s === '' ? null : s)

/** Map a `PitchRow` → DB row for insert. */
export function rowToDb(
  row: PitchRow,
  ctx: { session_id: string; uploaded_by: string; athlete_profile_id?: string | null }
): DbPitchInsert {
  return {
    session_id: ctx.session_id,
    uploaded_by: ctx.uploaded_by,
    athlete_profile_id: ctx.athlete_profile_id ?? null,
    tm_pitch_uid: orNull(row.PitchUID),

    pitch_no: row.PitchNo || null,
    pitch_date: orNull(row.Date),
    pitch_time: orNull(row.Time),
    pitcher_name: orNull(row.Pitcher),
    tm_pitcher_id: orNull(row.PitcherId),
    pitcher_throws: orNull(row.PitcherThrows),
    pitcher_team: orNull(row.PitcherTeam),
    pitcher_set: orNull(row.PitcherSet),
    pitch_call: orNull(row.PitchCall),
    balls: row.Balls,
    strikes: row.Strikes,
    tagged_pitch_type: orNull(row.TaggedPitchType),
    pitch_session: orNull(row.PitchSession),
    flag: orNull(row.Flag),

    rel_speed: row.RelSpeed,
    vert_rel_angle: row.VertRelAngle,
    horz_rel_angle: row.HorzRelAngle,
    spin_rate: row.SpinRate,
    spin_axis: row.SpinAxis,
    tilt: orNull(row.Tilt),
    rel_height: row.RelHeight,
    rel_side: row.RelSide,
    extension: row.Extension,

    vert_break: row.VertBreak,
    induced_vert_break: row.InducedVertBreak,
    horz_break: row.HorzBreak,

    plate_loc_height: row.PlateLocHeight,
    plate_loc_side: row.PlateLocSide,
    zone_speed: row.ZoneSpeed,
    vert_appr_angle: row.VertApprAngle,
    horz_appr_angle: row.HorzApprAngle,
    zone_time: row.ZoneTime,
    pfxx: row.pfxx,
    pfxz: row.pfxz,

    x0: row.x0, y0: row.y0, z0: row.z0,
    vx0: row.vx0, vy0: row.vy0, vz0: row.vz0,
    ax0: row.ax0, ay0: row.ay0, az0: row.az0,

    play_id: orNull(row.PlayID),
    calibration_id: orNull(row.CalibrationId),
    eff_velocity: row.EffVelocity,
    practice_type: orNull(row.PracticeType),
    device: orNull(row.Device),
    direction: orNull(row.Direction),

    tm_batter_id: orNull(row.BatterId),
    batter_name: orNull(row.Batter),
    hit_spin_rate: row.HitSpinRate,
    hit_type: orNull(row.HitType),
    exit_speed: row.ExitSpeed,
    batter_side: orNull(row.BatterSide),
    angle: row.Angle,
    position_at_110_x: row.PositionAt110X,
    position_at_110_y: row.PositionAt110Y,
    position_at_110_z: row.PositionAt110Z,
    distance: row.Distance,
    last_tracked_distance: row.LastTrackedDistance,
    hang_time: row.HangTime,
    bearing: row.Bearing,
    contact_position_x: row.ContactPositionX,
    contact_position_y: row.ContactPositionY,
    contact_position_z: row.ContactPositionZ,

    spin_axis_3d_transverse_angle: row.SpinAxis3dTransverseAngle,
    spin_axis_3d_longitudinal_angle: row.SpinAxis3dLongitudinalAngle,
    spin_axis_3d_active_spin_rate: row.SpinAxis3dActiveSpinRate,
    spin_axis_3d_spin_efficiency: row.SpinAxis3dSpinEfficiency,
    spin_axis_3d_tilt: row.SpinAxis3dTilt,

    tm_session_id: orNull(row.SessionId),
    raw: null,
  }
}

/** Map a DB row → `PitchRow` for the client. */
export function dbToRow(d: any): PitchRow {
  const s = (v: unknown) => (v == null ? '' : String(v))
  const n = (v: unknown) => (v == null ? null : Number(v))
  return {
    PitchNo: Number(d.pitch_no) || 0,
    Date: s(d.pitch_date),
    Time: s(d.pitch_time),
    Pitcher: s(d.pitcher_name),
    PitcherId: s(d.tm_pitcher_id),
    PitcherThrows: s(d.pitcher_throws),
    PitcherTeam: s(d.pitcher_team),
    PitcherSet: s(d.pitcher_set),
    PitchCall: s(d.pitch_call),
    Balls: n(d.balls),
    Strikes: n(d.strikes),
    TaggedPitchType: s(d.tagged_pitch_type),
    PitchSession: s(d.pitch_session),
    Flag: s(d.flag),

    RelSpeed: n(d.rel_speed),
    VertRelAngle: n(d.vert_rel_angle),
    HorzRelAngle: n(d.horz_rel_angle),
    SpinRate: n(d.spin_rate),
    SpinAxis: n(d.spin_axis),
    Tilt: s(d.tilt),
    RelHeight: n(d.rel_height),
    RelSide: n(d.rel_side),
    Extension: n(d.extension),

    VertBreak: n(d.vert_break),
    InducedVertBreak: n(d.induced_vert_break),
    HorzBreak: n(d.horz_break),

    PlateLocHeight: n(d.plate_loc_height),
    PlateLocSide: n(d.plate_loc_side),
    ZoneSpeed: n(d.zone_speed),
    VertApprAngle: n(d.vert_appr_angle),
    HorzApprAngle: n(d.horz_appr_angle),
    ZoneTime: n(d.zone_time),
    pfxx: n(d.pfxx),
    pfxz: n(d.pfxz),

    x0: n(d.x0), y0: n(d.y0), z0: n(d.z0),
    vx0: n(d.vx0), vy0: n(d.vy0), vz0: n(d.vz0),
    ax0: n(d.ax0), ay0: n(d.ay0), az0: n(d.az0),

    PlayID: s(d.play_id),
    CalibrationId: s(d.calibration_id),
    EffVelocity: n(d.eff_velocity),
    PracticeType: s(d.practice_type),
    Device: s(d.device),
    Direction: s(d.direction),

    BatterId: s(d.tm_batter_id),
    Batter: s(d.batter_name),
    HitSpinRate: n(d.hit_spin_rate),
    HitType: s(d.hit_type),
    ExitSpeed: n(d.exit_speed),
    BatterSide: s(d.batter_side),
    Angle: n(d.angle),
    PositionAt110X: n(d.position_at_110_x),
    PositionAt110Y: n(d.position_at_110_y),
    PositionAt110Z: n(d.position_at_110_z),
    Distance: n(d.distance),
    LastTrackedDistance: n(d.last_tracked_distance),
    HangTime: n(d.hang_time),
    Bearing: n(d.bearing),
    ContactPositionX: n(d.contact_position_x),
    ContactPositionY: n(d.contact_position_y),
    ContactPositionZ: n(d.contact_position_z),

    SpinAxis3dTransverseAngle: n(d.spin_axis_3d_transverse_angle),
    SpinAxis3dLongitudinalAngle: n(d.spin_axis_3d_longitudinal_angle),
    SpinAxis3dActiveSpinRate: n(d.spin_axis_3d_active_spin_rate),
    SpinAxis3dSpinEfficiency: n(d.spin_axis_3d_spin_efficiency),
    SpinAxis3dTilt: n(d.spin_axis_3d_tilt),

    PitchUID: s(d.tm_pitch_uid),
    SessionId: s(d.tm_session_id),
  }
}
