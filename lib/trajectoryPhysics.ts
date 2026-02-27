/**
 * trajectoryPhysics — Pure 3D kinematics for Statcast pitch trajectory simulation.
 *
 * Coordinate system (Statcast convention):
 *   x  — horizontal, positive toward first base (catcher's perspective)
 *   y  — distance from home plate, positive toward pitcher's mound
 *   z  — vertical, positive upward
 *
 * All units are feet and seconds unless otherwise noted.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Point3D {
  x: number
  y: number
  z: number
}

export interface TrajectoryPoint extends Point3D {
  /** Elapsed time in seconds since release */
  t: number
}

/**
 * Minimal Statcast fields required for trajectory simulation.
 * All velocity / acceleration values are in ft/s and ft/s².
 */
export interface PitchKinematics {
  vx0: number
  vy0: number
  vz0: number
  ax: number
  ay: number
  az: number
  release_pos_x: number
  release_pos_z: number
  /** Distance from the rubber the ball is released (feet). */
  release_extension: number
}

export interface Camera {
  x: number
  y: number
  z: number
  /** Vertical field of view in degrees */
  fov: number
}

export interface ScreenPoint {
  x: number
  y: number
  /** Perspective scale factor (larger = closer to camera) */
  scale: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Y-coordinate of the front edge of home plate (17 inches = 17/12 ft) */
const PLATE_FRONT_Y = 17 / 12 // ≈ 1.417 ft

// ---------------------------------------------------------------------------
// computeTrajectory
// ---------------------------------------------------------------------------

/**
 * Simulate a pitch from the release point to the front of home plate using
 * constant-acceleration kinematics:
 *   pos(t) = pos0 + v0*t + 0.5*a*t²
 *
 * @param pitch  Statcast pitch object with initial conditions
 * @param steps  Number of time-steps to sample along the path (default 60)
 * @returns      Array of {x, y, z, t} trajectory points from release to plate
 */
export function computeTrajectory(
  pitch: PitchKinematics,
  steps = 60
): TrajectoryPoint[] {
  const { vx0, vy0, vz0, ax, ay, az, release_pos_x, release_pos_z, release_extension } = pitch

  // Release point y: Statcast y=0 is home plate; release is 50 ft from plate
  // minus any extension beyond the rubber.
  const y0 = 50 - release_extension

  // Solve for total flight time using kinematic equation for y-axis.
  // We need t such that: y0 + vy0*t + 0.5*ay*t² = PLATE_FRONT_Y
  // Rearranged:  0.5*ay*t² + vy0*t + (y0 - PLATE_FRONT_Y) = 0
  const discriminant = vy0 * vy0 - 2 * ay * (y0 - PLATE_FRONT_Y)
  const totalTime = (-vy0 - Math.sqrt(Math.max(0, discriminant))) / ay

  const dt = totalTime / steps
  const points: TrajectoryPoint[] = []

  for (let i = 0; i <= steps; i++) {
    const t = i * dt
    const x = release_pos_x + vx0 * t + 0.5 * ax * t * t
    const y = y0 + vy0 * t + 0.5 * ay * t * t
    const z = release_pos_z + vz0 * t + 0.5 * az * t * t
    points.push({ x, y, z, t })
    // Stop once the ball reaches or passes the front of the plate
    if (y <= PLATE_FRONT_Y) break
  }

  return points
}

// ---------------------------------------------------------------------------
// projectToScreen
// ---------------------------------------------------------------------------

/**
 * Simple perspective projection from 3D world space to 2D canvas coordinates.
 *
 * The camera looks toward the pitcher's mound (increasing y).  World-space
 * origin is at home plate.  The canvas origin (0, 0) is the top-left corner.
 *
 * @param point3d     World-space point to project
 * @param camera      Camera position and field-of-view
 * @param canvasWidth  Width of the target canvas in pixels
 * @param canvasHeight Height of the target canvas in pixels
 * @returns           Canvas-space {x, y} coordinates and perspective scale
 */
export function projectToScreen(
  point3d: Point3D,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number
): ScreenPoint {
  // Translate point into camera space
  const dx = point3d.x - camera.x
  const dy = point3d.y - camera.y // depth axis
  const dz = point3d.z - camera.z

  // Avoid division by zero; clamp depth to a small positive value
  const depth = Math.max(dy, 0.01)

  // Convert vertical fov to focal length in pixels
  const fovRad = (camera.fov * Math.PI) / 180
  const focalLength = canvasHeight / 2 / Math.tan(fovRad / 2)

  const scale = focalLength / depth

  // Project onto image plane; canvas y increases downward so negate dz
  const screenX = canvasWidth / 2 + dx * scale
  const screenY = canvasHeight / 2 - dz * scale

  return { x: screenX, y: screenY, scale }
}

// ---------------------------------------------------------------------------
// SimulatedPitch support
// ---------------------------------------------------------------------------

export interface SimulatedPitch {
  id: string
  name: string
  color: string
  velocity: number        // mph
  spinRate: number        // rpm
  spinAxis: number        // degrees (gyro angle)
  hBreak: number          // inches (horizontal movement)
  iVBreak: number         // inches (induced vertical break)
  releasePosX: number     // feet
  releasePosZ: number     // feet
}

/**
 * Convert a user-designed simulated pitch into PitchKinematics
 * suitable for computeTrajectory().
 *
 * The model uses:
 *  - velocity → initial vy0 (toward plate)
 *  - hBreak/iVBreak → lateral and vertical accelerations
 *  - Gravity is included in az
 *
 * @param pitch   The simulated pitch definition
 * @param targetX Horizontal target in feet (0 = center of plate)
 * @param targetZ Vertical target in feet (2.5 = mid strike zone)
 */
export function simulatedPitchToKinematics(
  pitch: SimulatedPitch,
  targetX = 0,
  targetZ = 2.5,
): PitchKinematics {
  const releaseExtension = 6.0 // typical pitcher extension in feet
  const releaseY = 50 - releaseExtension

  // Convert velocity from mph to ft/s
  const speedFtPerS = pitch.velocity * 5280 / 3600

  // Flight time estimate: distance / speed (approximate)
  const flightDist = releaseY - PLATE_FRONT_Y
  const flightTime = flightDist / speedFtPerS

  // Convert movement from inches to feet
  const hBreakFt = pitch.hBreak / 12
  const iVBreakFt = pitch.iVBreak / 12

  // Movement = 0.5 * a * t^2 → a = 2 * movement / t^2
  const ax = (2 * hBreakFt) / (flightTime * flightTime)
  const gravity = -32.174 // ft/s²
  // IVB is movement *above* gravity, so total az = gravity + (2 * iVBreak / t^2)
  const az = gravity + (2 * iVBreakFt) / (flightTime * flightTime)

  // vy0: ball must travel from releaseY to plate in flightTime
  // y(t) = releaseY + vy0*t + 0.5*ay*t^2 = PLATE_FRONT_Y
  // We need ay — approximate drag deceleration (~-28 ft/s²)
  const ay = -28

  // vy0 = (PLATE_FRONT_Y - releaseY - 0.5*ay*t^2) / t
  const vy0 = (PLATE_FRONT_Y - releaseY - 0.5 * ay * flightTime * flightTime) / flightTime

  // vx0: aim for target, compensating for horizontal acceleration
  // x(t) = releasePosX + vx0*t + 0.5*ax*t^2 = targetX
  const vx0 = (targetX - pitch.releasePosX - 0.5 * ax * flightTime * flightTime) / flightTime

  // vz0: aim for target Z, compensating for vertical acceleration
  // z(t) = releasePosZ + vz0*t + 0.5*az*t^2 = targetZ
  const vz0 = (targetZ - pitch.releasePosZ - 0.5 * az * flightTime * flightTime) / flightTime

  return {
    vx0,
    vy0,
    vz0,
    ax,
    ay,
    az,
    release_pos_x: pitch.releasePosX,
    release_pos_z: pitch.releasePosZ,
    release_extension: releaseExtension,
  }
}

/**
 * Compute kinematics for a pitch tunneled with a reference pitch.
 *
 * The tunneled pitch shares the same initial trajectory direction
 * (vx0/vy0 and vz0/vy0 launch-angle ratios) as the reference pitch
 * but uses its own speed and movement profile. This causes the ball
 * to start on the same visual path then deviate naturally.
 *
 * @param pitch         The pitch to tunnel
 * @param referenceKin  Kinematics of the reference pitch (usually a fastball aimed at the target)
 */
// ---------------------------------------------------------------------------
// Batted Ball Trajectory
// ---------------------------------------------------------------------------

/**
 * Compute a batted ball trajectory using projectile motion with air drag.
 *
 * Coordinate system for batted balls (top-down field view):
 *   x  — horizontal (positive toward RF, negative toward LF)
 *   y  — depth into field (positive toward outfield)
 *   z  — vertical (positive upward)
 *
 * @param params  Launch conditions
 * @param steps   Number of integration steps (default 100)
 * @returns       TrajectoryPoint[] from bat contact to landing (z ≤ 0)
 */
export function computeBattedBallTrajectory(
  params: { launchSpeed: number; launchAngle: number; sprayAngle: number },
  steps = 100,
): TrajectoryPoint[] {
  const { launchSpeed, launchAngle, sprayAngle } = params

  // Convert to ft/s and radians
  const v0 = launchSpeed * 5280 / 3600  // mph → ft/s
  const laRad = (launchAngle * Math.PI) / 180
  const saRad = (sprayAngle * Math.PI) / 180

  // Initial velocity components
  const vHoriz = v0 * Math.cos(laRad)
  let vx = vHoriz * Math.sin(saRad)   // lateral (+ = RF)
  let vy = vHoriz * Math.cos(saRad)   // into field
  let vz = v0 * Math.sin(laRad)       // vertical

  // Baseball constants
  const g = 32.174       // gravity ft/s²
  const Cd = 0.35        // drag coefficient
  const rho = 0.0023769  // air density slugs/ft³ (sea level)
  const A = 0.02922      // cross-section area ft² (baseball ~2.9 in diameter)
  const m = 0.3125 / g   // mass in slugs (5 oz = 0.3125 lb)
  const dragK = 0.5 * Cd * rho * A / m  // drag factor

  // Starting position: 3ft above ground at home plate
  let x = 0, y = 0, z = 3
  const dt = 0.02  // 20ms timesteps
  const points: TrajectoryPoint[] = [{ x: 0, y: 0, z: 3, t: 0 }]

  for (let i = 1; i <= steps * 10; i++) {
    const t = i * dt

    // Speed magnitude
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
    const drag = dragK * speed

    // Update velocities (drag opposes motion)
    vx -= drag * vx * dt
    vy -= drag * vy * dt
    vz -= (g + drag * vz) * dt

    // Update positions
    x += vx * dt
    y += vy * dt
    z += vz * dt

    points.push({ x, y, z: Math.max(0, z), t })

    // Ball has landed
    if (z <= 0) break

    // Safety: bail after 10 seconds
    if (t > 10) break
  }

  return points
}

/**
 * Convert Statcast hit coordinates (hc_x, hc_y) to spray angle in degrees.
 *
 * Statcast coordinate system:
 *   hc_x: 0-250, home plate at ~125.42
 *   hc_y: 0-250, home plate at ~198.27, outfield toward 0
 *
 * Returns spray angle in degrees: 0° = center field, negative = LF, positive = RF.
 */
export function sprayAngleFromHC(hc_x: number, hc_y: number): number {
  return Math.atan2(hc_x - 125.42, 198.27 - hc_y) * (180 / Math.PI)
}

// ---------------------------------------------------------------------------
// Tunnel Pitch
// ---------------------------------------------------------------------------

export function tunnelPitchKinematics(
  pitch: SimulatedPitch,
  referenceKin: PitchKinematics,
): PitchKinematics {
  const releaseExtension = 6.0
  const releaseY = 50 - releaseExtension

  // Reference pitch launch-angle ratios (direction the ball leaves the hand)
  const dirRatioX = referenceKin.vx0 / referenceKin.vy0
  const dirRatioZ = referenceKin.vz0 / referenceKin.vy0

  // This pitch's own speed
  const speedFtPerS = pitch.velocity * 5280 / 3600
  const flightDist = releaseY - PLATE_FRONT_Y
  const flightTime = flightDist / speedFtPerS

  // Compute vy0 from this pitch's speed (accounting for drag)
  const ay = -28
  const vy0 = (PLATE_FRONT_Y - releaseY - 0.5 * ay * flightTime * flightTime) / flightTime

  // Same angular direction as reference pitch
  const vx0 = dirRatioX * vy0
  const vz0 = dirRatioZ * vy0

  // This pitch's own accelerations (from its movement profile)
  const hBreakFt = pitch.hBreak / 12
  const iVBreakFt = pitch.iVBreak / 12
  const ax = (2 * hBreakFt) / (flightTime * flightTime)
  const gravity = -32.174
  const az = gravity + (2 * iVBreakFt) / (flightTime * flightTime)

  return {
    vx0, vy0, vz0,
    ax, ay, az,
    release_pos_x: pitch.releasePosX,
    release_pos_z: pitch.releasePosZ,
    release_extension: releaseExtension,
  }
}
