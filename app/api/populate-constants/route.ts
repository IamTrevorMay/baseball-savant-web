import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { SEASON_CONSTANTS } from '@/lib/constants-data'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    const rows = Object.entries(SEASON_CONSTANTS).map(([season, c]) => ({
      season: Number(season),
      woba_scale: c.woba_scale,
      wbb: c.wbb,
      whbp: c.whbp,
      w1b: c.w1b,
      w2b: c.w2b,
      w3b: c.w3b,
      whr: c.whr,
      run_sb: c.run_sb,
      run_cs: c.run_cs,
      r_pa: c.r_pa,
      r_w: c.r_w,
      cfip: c.cfip,
      lg_era: c.lg_era,
      lg_babip: c.lg_babip,
      lg_k_pct: c.lg_k_pct,
      lg_bb_pct: c.lg_bb_pct,
      lg_hr_pct: c.lg_hr_pct,
    }))

    const { error } = await supabase.from('season_constants').upsert(rows, { onConflict: 'season' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ inserted: rows.length, message: `Populated ${rows.length} seasons of constants` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
