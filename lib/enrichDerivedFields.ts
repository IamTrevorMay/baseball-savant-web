/**
 * Pure function that enriches pitch rows with derived fields:
 * VAA, HAA, pfx_x_in, pfx_z_in, brink, vs_team, cluster, hdev, vdev
 *
 * Mutates rows in-place for performance (matches original usePlayerData behavior).
 */
export function enrichDerivedFields(allRows: any[]): void {
  allRows.forEach((p: any) => {
    // Vertical Approach Angle (degrees)
    if (p.vz0 != null && p.vy0 != null && p.az != null && p.ay != null && p.release_extension != null) {
      const t = (-p.vy0 - Math.sqrt(p.vy0 * p.vy0 - 2 * p.ay * (50 - p.release_extension))) / p.ay
      const vzf = p.vz0 + p.az * t
      const vyf = p.vy0 + p.ay * t
      p.vaa = Math.atan2(vzf, -vyf) * (180 / Math.PI)
    }
    // Horizontal Approach Angle (degrees)
    if (p.vx0 != null && p.vy0 != null && p.ax != null && p.ay != null && p.release_extension != null) {
      const t = (-p.vy0 - Math.sqrt(p.vy0 * p.vy0 - 2 * p.ay * (50 - p.release_extension))) / p.ay
      const vxf = p.vx0 + p.ax * t
      const vyf = p.vy0 + p.ay * t
      p.haa = Math.atan2(vxf, -vyf) * (180 / Math.PI)
    }
    // Movement in inches
    if (p.pfx_x != null) p.pfx_x_in = +(p.pfx_x * 12).toFixed(1)
    if (p.pfx_z != null) p.pfx_z_in = +(p.pfx_z * 12).toFixed(1)
    // Brink — signed distance to nearest strike zone edge (inches)
    if (p.plate_x != null && p.plate_z != null && p.sz_top != null && p.sz_bot != null) {
      const dLeft = p.plate_x + 0.83, dRight = 0.83 - p.plate_x
      const dBot = p.plate_z - p.sz_bot, dTop = p.sz_top - p.plate_z
      p.brink = +(Math.min(dLeft, dRight, dBot, dTop) * 12).toFixed(1)
    }
    // vs Team (batting team)
    if (p.inning_topbot === 'Top') p.vs_team = p.away_team
    else if (p.inning_topbot === 'Bot') p.vs_team = p.home_team
  })

  // Cluster / HDev / VDev — distance from year-partitioned pitch-type centroid (inches)
  const cBuckets: Record<string, { sx: number; sz: number; n: number }> = {}
  allRows.forEach((p: any) => {
    if (p.pitch_name && p.plate_x != null && p.plate_z != null) {
      const key = p.game_year != null ? `${p.game_year}::${p.pitch_name}` : p.pitch_name
      if (!cBuckets[key]) cBuckets[key] = { sx: 0, sz: 0, n: 0 }
      cBuckets[key].sx += p.plate_x
      cBuckets[key].sz += p.plate_z
      cBuckets[key].n++
    }
  })
  const cCentroids: Record<string, { cx: number; cz: number }> = {}
  for (const name in cBuckets) {
    const b = cBuckets[name]
    cCentroids[name] = { cx: b.sx / b.n, cz: b.sz / b.n }
  }
  allRows.forEach((p: any) => {
    if (p.pitch_name && p.plate_x != null && p.plate_z != null) {
      const key = p.game_year != null ? `${p.game_year}::${p.pitch_name}` : p.pitch_name
      const c = cCentroids[key]
      if (c) {
        p.cluster = +(Math.sqrt((p.plate_x - c.cx) ** 2 + (p.plate_z - c.cz) ** 2) * 12).toFixed(1)
        p.hdev = +((c.cx - p.plate_x) * 12).toFixed(1)
        p.vdev = +((p.plate_z - c.cz) * 12).toFixed(1)
      }
    }
  })
}
