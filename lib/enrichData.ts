/**
 * enrichData — Derived field computation for Statcast pitch rows.
 *
 * Adds the following fields in-place on each pitch row:
 *   vaa          Vertical Approach Angle (degrees)
 *   haa          Horizontal Approach Angle (degrees)
 *   pfx_x_in     Horizontal movement (inches, from feet)
 *   pfx_z_in     Vertical movement (inches, from feet)
 *   brink        Signed distance to nearest strike zone edge (inches)
 *   cluster      Distance from pitch-type centroid (inches)
 *   vs_team      Batting team (derived from inning_topbot)
 *   batter_name  Batter display name (from lookup map)
 */
export function enrichData(
  rows: any[],
  batterNames: Record<number, string> = {}
): any[] {
  // ------------------------------------------------------------------
  // Pre-pass: compute year-partitioned pitch-type centroids for Cluster/HDev/VDev
  // ------------------------------------------------------------------
  const centroids: Record<string, { cx: number; cz: number }> = {}
  const buckets: Record<string, { sx: number; sz: number; n: number }> = {}
  rows.forEach((p: any) => {
    if (p.pitch_name && p.plate_x != null && p.plate_z != null) {
      const key = p.game_year != null ? `${p.game_year}::${p.pitch_name}` : p.pitch_name
      if (!buckets[key]) buckets[key] = { sx: 0, sz: 0, n: 0 }
      buckets[key].sx += p.plate_x
      buckets[key].sz += p.plate_z
      buckets[key].n++
    }
  })
  for (const name in buckets) {
    const b = buckets[name]
    centroids[name] = { cx: b.sx / b.n, cz: b.sz / b.n }
  }

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
    // Brink — signed distance to nearest strike zone edge (inches)
    // Positive = inside zone, negative = outside, 0 = on edge.
    // ------------------------------------------------------------------
    if (p.plate_x != null && p.plate_z != null && p.sz_top != null && p.sz_bot != null) {
      const dLeft  = p.plate_x + 0.83
      const dRight = 0.83 - p.plate_x
      const dBot   = p.plate_z - p.sz_bot
      const dTop   = p.sz_top - p.plate_z
      p.brink = +(Math.min(dLeft, dRight, dBot, dTop) * 12).toFixed(1)
    }

    // ------------------------------------------------------------------
    // Cluster / HDev / VDev — distance from year-partitioned pitch-type centroid (inches)
    // ------------------------------------------------------------------
    if (p.pitch_name && p.plate_x != null && p.plate_z != null) {
      const key = p.game_year != null ? `${p.game_year}::${p.pitch_name}` : p.pitch_name
      const c = centroids[key]
      if (c) {
        p.cluster = +(Math.sqrt((p.plate_x - c.cx) ** 2 + (p.plate_z - c.cz) ** 2) * 12).toFixed(1)
        p.hdev = +((c.cx - p.plate_x) * 12).toFixed(1)
        p.vdev = +((p.plate_z - c.cz) * 12).toFixed(1)
      }
    }

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

    // ------------------------------------------------------------------
    // Count string (e.g. "0-2")
    // ------------------------------------------------------------------
    if (p.balls != null && p.strikes != null) p.count = `${p.balls}-${p.strikes}`

    // ------------------------------------------------------------------
    // Base situation label
    // ------------------------------------------------------------------
    const r1 = p.on_1b != null, r2 = p.on_2b != null, r3 = p.on_3b != null
    if (!r1 && !r2 && !r3) p.base_situation = 'Bases Empty'
    else if (r1 && !r2 && !r3) p.base_situation = 'Runner on 1st'
    else if (!r1 && r2 && !r3) p.base_situation = 'Runner on 2nd'
    else if (!r1 && !r2 && r3) p.base_situation = 'Runner on 3rd'
    else if (r1 && r2 && !r3) p.base_situation = 'Runners 1st & 2nd'
    else if (r1 && !r2 && r3) p.base_situation = 'Runners 1st & 3rd'
    else if (!r1 && r2 && r3) p.base_situation = 'Runners 2nd & 3rd'
    else if (r1 && r2 && r3) p.base_situation = 'Bases Loaded'
  })

  return rows
}
