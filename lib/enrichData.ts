/**
 * enrichData — Derived field computation for Statcast pitch rows.
 *
 * Adds the following fields in-place on each pitch row:
 *   vaa          Vertical Approach Angle (degrees)
 *   haa          Horizontal Approach Angle (degrees)
 *   pfx_x_in     Horizontal movement (inches, from feet)
 *   pfx_z_in     Vertical movement (inches, from feet)
 *   vs_team      Batting team (derived from inning_topbot)
 *   batter_name  Batter display name (from lookup map)
 */
export function enrichData(
  rows: any[],
  batterNames: Record<number, string> = {}
): any[] {
  rows.forEach((p: any) => {
    // ------------------------------------------------------------------
    // Vertical Approach Angle (degrees)
    // Compute time-to-front-of-plate, then resolve velocity components.
    // ------------------------------------------------------------------
    if (
      p.vz0 != null &&
      p.vy0 != null &&
      p.az != null &&
      p.ay != null &&
      p.release_extension != null
    ) {
      const t =
        (-p.vy0 - Math.sqrt(p.vy0 * p.vy0 - 2 * p.ay * (50 - p.release_extension))) /
        p.ay
      const vzf = p.vz0 + p.az * t
      const vyf = p.vy0 + p.ay * t
      p.vaa = Math.atan2(vzf, -vyf) * (180 / Math.PI)
    }

    // ------------------------------------------------------------------
    // Horizontal Approach Angle (degrees)
    // ------------------------------------------------------------------
    if (
      p.vx0 != null &&
      p.vy0 != null &&
      p.ax != null &&
      p.ay != null &&
      p.release_extension != null
    ) {
      const t =
        (-p.vy0 - Math.sqrt(p.vy0 * p.vy0 - 2 * p.ay * (50 - p.release_extension))) /
        p.ay
      const vxf = p.vx0 + p.ax * t
      const vyf = p.vy0 + p.ay * t
      p.haa = Math.atan2(vxf, -vyf) * (180 / Math.PI)
    }

    // ------------------------------------------------------------------
    // Movement in inches (Statcast stores pfx values in feet)
    // ------------------------------------------------------------------
    if (p.pfx_x != null) p.pfx_x_in = +(p.pfx_x * 12).toFixed(1)
    if (p.pfx_z != null) p.pfx_z_in = +(p.pfx_z * 12).toFixed(1)

    // ------------------------------------------------------------------
    // vs_team — the team currently batting
    // Top of inning: visiting (away) team bats; Bot: home team bats.
    // ------------------------------------------------------------------
    if (p.inning_topbot === 'Top') p.vs_team = p.away_team
    else if (p.inning_topbot === 'Bot') p.vs_team = p.home_team

    // ------------------------------------------------------------------
    // Batter display name from lookup
    // ------------------------------------------------------------------
    if (p.batter && batterNames[p.batter]) {
      p.batter_name = batterNames[p.batter]
    }
  })

  return rows
}
