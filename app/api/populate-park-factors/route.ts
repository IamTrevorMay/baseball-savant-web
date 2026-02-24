import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { PARK_FACTORS } from '@/lib/constants-data'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    // Apply the same park factors for each season 2015–2025
    // (5-year rolling factors are stable enough for this purpose)
    const rows: any[] = []
    for (let season = 2015; season <= 2025; season++) {
      for (const [team, pf] of Object.entries(PARK_FACTORS)) {
        rows.push({
          season,
          team,
          basic: pf.basic,
          pf_hr: pf.pf_hr,
          pf_so: pf.pf_so,
          pf_bb: pf.pf_bb,
        })
      }
    }

    let inserted = 0
    const batchSize = 500
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const { error } = await supabase.from('park_factors').upsert(batch, { onConflict: 'season,team' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      inserted += batch.length
    }

    return NextResponse.json({ inserted, message: `Populated ${inserted} park factor rows (${Object.keys(PARK_FACTORS).length} teams x 11 seasons)` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
